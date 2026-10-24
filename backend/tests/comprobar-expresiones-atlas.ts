// Verificación OPCIONAL y de SOLO LECTURA. No inserta documentos ni modifica índices.
// MongoDB evalúa las expresiones sobre documentos ficticios con $documents.
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { conectarDB, cerrarDB } from '../src/db.ts'
import { crearGestorAplicacion } from '../src/controladores/aplicacion.ts'
import { memoria } from './memoria.ts'
import { semilla, usuarioSesion, id } from './fixtures.ts'

try {
  const semillaInicial = semilla(), almacen = memoria(semillaInicial)
  const gestionar = crearGestorAplicacion({ conectar: async () => almacen.db, usuario: async () => usuarioSesion('ENTRENADOR'), transaccion: almacen.transaccion })
  for (let indice = 0; indice < 13; indice++) {
    const req = Readable.from([JSON.stringify({ clienteId: id(11).toHexString(), observaciones: '$texto literal ' + indice, ejercicios: [{ ejercicioId: id(31).toHexString(), series: 3, repeticiones: 12, peso: 12.5, descanso: 60 }] })]) as unknown as IncomingMessage
    req.method = 'POST'; req.url = '/api/rutinas'; req.headers = { 'content-type': 'application/json' }
    let estado = 0
    const res = { writeHead: (codigo: number) => { estado = codigo }, end: () => {} } as unknown as ServerResponse
    await gestionar(req, res); assert.equal(estado, 201)
  }
  const vigente = almacen.documentos('clientes')[0]!.rutinas.at(-1)
  const editar = Readable.from([JSON.stringify({ clienteId: id(11).toHexString(), rutinaId: vigente._id.toHexString(), version: 0, observaciones: '$edición literal', ejercicios: [{ ejercicioId: id(31).toHexString(), series: 4, repeticiones: 10, peso: 12.5, descanso: 60 }] })]) as unknown as IncomingMessage
  editar.method = 'POST'; editar.url = '/api/rutinas'; editar.headers = { 'content-type': 'application/json' }
  let estadoEdicion = 0
  await gestionar(editar, { writeHead: (codigo: number) => { estadoEdicion = codigo }, end: () => {} } as unknown as ServerResponse)
  assert.equal(estadoEdicion, 200)
  const db = await conectarDB()
  const validador = (await db.listCollections({ name: 'clientes' }, { nameOnly: false }).toArray())[0]!.options!.validator
  const etapas = almacen.escrituras.filter(e => e.coleccion === 'clientes').flatMap(e => e.cambio)
  const resultado = await db.command({ aggregate: 1, pipeline: [{ $documents: [semillaInicial.clientes[0]] }, ...etapas, { $match: validador }], cursor: {} })
  const documento = resultado.cursor.firstBatch[0]
  assert.ok(documento, 'La rutina debe cumplir el validador real de Atlas')
  assert.equal(documento.rutinas.length, 12)
  assert.equal(documento.rutinas.filter((r: { activo: boolean }) => r.activo).length, 1)
  assert.equal(documento.rutinas.at(-1).observaciones, '$edición literal')
  assert.equal(documento.rutinas.at(-1).ejercicios[0].series, 4)
  for (const coleccion of ['ejercicios', 'turnos', 'pagos'] as const) {
    const esquema = (await db.listCollections({ name: coleccion }, { nameOnly: false }).toArray())[0]!.options!.validator
    const respuesta = await db.command({ aggregate: 1, pipeline: [{ $documents: semillaInicial[coleccion] }, { $match: esquema }], cursor: {} })
    assert.equal(respuesta.cursor.firstBatch.length, semillaInicial[coleccion].length, coleccion)
  }
  console.log('Atlas: expresiones de rutinas y documentos ficticios compatibles con los cuatro validadores. Ningún dato persistido.')
} catch (error) {
  console.error(error instanceof assert.AssertionError ? error.message : 'No se pudo completar la comprobación de solo lectura en Atlas.')
  process.exitCode = 1
} finally { await cerrarDB() }
