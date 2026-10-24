// Doble de MongoDB solo para pruebas. Nunca se conecta a Atlas.
import { BSON, ObjectId, MongoServerError } from 'mongodb'
import type { Db, ClientSession, Document } from 'mongodb'

const copiar = <T>(dato: T): T => BSON.deserialize(BSON.serialize({ dato })).dato as T
const iguales = (a: any, b: any): boolean => a instanceof ObjectId ? a.equals(b) : a instanceof Date ? a.getTime() === new Date(b).getTime() : a === b
const obtener = (objeto: any, ruta: string): any => ruta.split('.').reduce((valor, clave) => valor?.[clave], objeto)

// Subconjunto de expresiones utilizadas por las actualizaciones atómicas.
function evaluar(valor: any, documento: any, variables: any = {}): any {
  if (typeof valor === 'string' && valor.startsWith('$$')) return obtener(variables, valor.slice(2))
  if (typeof valor === 'string' && valor.startsWith('$')) return obtener(documento, valor.slice(1))
  if (!valor || typeof valor !== 'object' || valor instanceof Date || valor instanceof ObjectId) return valor
  if (Array.isArray(valor)) return valor.map(v => evaluar(v, documento, variables))
  if ('$literal' in valor) return copiar(valor.$literal)
  if ('$ifNull' in valor) return evaluar(valor.$ifNull[0], documento, variables) ?? evaluar(valor.$ifNull[1], documento, variables)
  if ('$size' in valor) return evaluar(valor.$size, documento, variables).length
  if ('$lt' in valor) return evaluar(valor.$lt[0], documento, variables) < evaluar(valor.$lt[1], documento, variables)
  if ('$eq' in valor) return iguales(evaluar(valor.$eq[0], documento, variables), evaluar(valor.$eq[1], documento, variables))
  if ('$lte' in valor) return evaluar(valor.$lte[0], documento, variables) <= evaluar(valor.$lte[1], documento, variables)
  if ('$concatArrays' in valor) return valor.$concatArrays.flatMap((v: any) => evaluar(v, documento, variables))
  if ('$slice' in valor) return evaluar(valor.$slice[0], documento, variables).slice(valor.$slice[1])
  if ('$mergeObjects' in valor) return Object.assign({}, ...valor.$mergeObjects.map((v: any) => evaluar(v, documento, variables)))
  if ('$cond' in valor) return evaluar(valor.$cond[evaluar(valor.$cond[0], documento, variables) ? 1 : 2], documento, variables)
  if ('$map' in valor) return evaluar(valor.$map.input, documento, variables).map((v: any) => evaluar(valor.$map.in, documento, { ...variables, [valor.$map.as]: v }))
  if ('$sortArray' in valor) return ordenar([...evaluar(valor.$sortArray.input, documento, variables)], valor.$sortArray.sortBy)
  return Object.fromEntries(Object.entries(valor).map(([clave, v]) => [clave, evaluar(v, documento, variables)]))
}

function coincide(documento: any, filtro: any): boolean {
  return Object.entries(filtro).every(([clave, valor]: [string, any]) => {
    if (clave === '$or') return valor.some((alternativa: any) => coincide(documento, alternativa))
    if (clave === '$expr') return Boolean(evaluar(valor, documento))
    const actual = obtener(documento, clave)
    if (valor === null) return actual == null
    if (valor && typeof valor === 'object' && !(valor instanceof ObjectId) && !(valor instanceof Date)) {
      if ('$elemMatch' in valor) return Array.isArray(actual) && actual.some(v => coincide(v, valor.$elemMatch))
      if ('$in' in valor) return valor.$in.some((v: any) => iguales(actual, v))
      if ('$ne' in valor) return Array.isArray(actual) ? !actual.some(v => iguales(v, valor.$ne)) : !iguales(actual, valor.$ne)
      if ('$gt' in valor) return actual > valor.$gt
      if ('$lt' in valor) return actual < valor.$lt
    }
    return Array.isArray(actual) ? actual.some(v => iguales(v, valor)) : iguales(actual, valor)
  })
}
function ordenar(filas: any[], orden: any): any[] {
  return filas.sort((a, b) => {
    for (const [campo, direccion] of Object.entries(orden)) {
      const av = obtener(a, campo), bv = obtener(b, campo)
      if (av > bv) return Number(direccion)
      if (av < bv) return -Number(direccion)
    }
    return 0
  })
}
function proyectar(documento: any, opciones: any = {}): any {
  if (!opciones.projection) return copiar(documento)
  return copiar(Object.fromEntries(Object.entries(documento).filter(([clave]) => clave === '_id' || opciones.projection[clave])))
}

export function memoria(inicial: Record<string, Document[]> = {}) {
  let datos = copiar(inicial)
  const escrituras: { coleccion: string; filtro: any; cambio: any }[] = []
  function coleccion(nombre: string): any {
    datos[nombre] ??= []
    function comprobarUnicos(documento: any, omitir?: any): void {
      const campos = nombre === 'clientes' ? ['dni', 'usuarioId'] : nombre === 'usuarios' ? ['email', 'clienteId'] : nombre === 'ejercicios' ? ['codigo'] : []
      for (const campo of campos) if (documento[campo] !== undefined && datos[nombre]!.some(d => !iguales(d._id, omitir) && iguales(d[campo], documento[campo]))) {
        throw new MongoServerError({ message: 'Duplicado de prueba', code: 11000, keyPattern: { [campo]: 1 } })
      }
    }
    function actualizar(documento: any, cambio: any): void {
      const nuevo = copiar(documento)
      if (Array.isArray(cambio)) {
        for (const etapa of cambio) for (const [campo, valor] of Object.entries(etapa.$set ?? {})) nuevo[campo] = evaluar(valor, documento)
      } else {
        Object.assign(nuevo, cambio.$set ?? {})
        for (const [campo, valor] of Object.entries(cambio.$inc ?? {})) nuevo[campo] = (nuevo[campo] ?? 0) + Number(valor)
        for (const campo of Object.keys(cambio.$unset ?? {})) delete nuevo[campo]
        for (const [campo, valor] of Object.entries(cambio.$addToSet ?? {})) { nuevo[campo] ??= []; if (!nuevo[campo].some((v: any) => iguales(v, valor))) nuevo[campo].push(valor) }
        for (const [campo, valor] of Object.entries(cambio.$pull ?? {})) nuevo[campo] = (nuevo[campo] ?? []).filter((v: any) => !iguales(v, valor))
        for (const [campo, valor] of Object.entries(cambio.$push ?? {})) { nuevo[campo] ??= []; nuevo[campo].push(valor) }
      }
      comprobarUnicos(nuevo, documento._id)
      for (const clave of Object.keys(documento)) delete documento[clave]
      Object.assign(documento, copiar(nuevo))
    }
    return {
      createIndex: async () => 'indice-de-prueba',
      bulkWrite: async (operaciones: any[]) => {
        for (const operacion of operaciones) {
          if (operacion.insertOne) await coleccion(nombre).insertOne(operacion.insertOne.document)
          if (operacion.updateOne) await coleccion(nombre).updateOne(operacion.updateOne.filter, operacion.updateOne.update)
        }
      },
      findOne: async (filtro: any, opciones?: any) => { const fila = datos[nombre]!.find(d => coincide(d, filtro)); return fila ? proyectar(fila, opciones) : null },
      find: (filtro: any = {}, opciones?: any) => {
        let filas = datos[nombre]!.filter(d => coincide(d, filtro)).map(d => proyectar(d, opciones))
        const cursor = { sort: (orden: any) => { filas = ordenar(filas, orden); return cursor }, toArray: async () => copiar(filas) }; return cursor
      },
      countDocuments: async (filtro: any) => datos[nombre]!.filter(d => coincide(d, filtro)).length,
      insertOne: async (documento: any) => { const nuevo = { ...copiar(documento), _id: documento._id ?? new ObjectId() }; comprobarUnicos(nuevo); datos[nombre]!.push(nuevo); return { insertedId: nuevo._id } },
      updateOne: async (filtro: any, cambio: any, opciones?: any) => {
        escrituras.push({ coleccion: nombre, filtro, cambio })
        const fila = datos[nombre]!.find(d => coincide(d, filtro))
        if (fila) { actualizar(fila, cambio); return { matchedCount: 1, modifiedCount: 1 } }
        if (opciones?.upsert) { const nuevo = { _id: new ObjectId(), ...filtro, ...cambio.$set }; datos[nombre]!.push(nuevo) }
        return { matchedCount: 0, modifiedCount: 0 }
      },
      updateMany: async (filtro: any, cambio: any) => { const filas = datos[nombre]!.filter(d => coincide(d, filtro)); filas.forEach(d => actualizar(d, cambio)); return { matchedCount: filas.length } },
      deleteMany: async (filtro: any) => { datos[nombre] = datos[nombre]!.filter(d => !coincide(d, filtro)) },
      deleteOne: async (filtro: any) => { const indice = datos[nombre]!.findIndex(d => coincide(d, filtro)); if (indice >= 0) datos[nombre]!.splice(indice, 1) },
      findOneAndDelete: async (filtro: any) => { const indice = datos[nombre]!.findIndex(d => coincide(d, filtro)); return indice >= 0 ? datos[nombre]!.splice(indice, 1)[0] : null },
      aggregate: (etapas: any[]) => ({ toArray: async () => {
        let filas = copiar(datos[nombre]!)
        for (const etapa of etapas) {
          if (etapa.$match) filas = filas.filter(d => coincide(d, etapa.$match))
          if (etapa.$sort) ordenar(filas, etapa.$sort)
          if (etapa.$group) { const vistos = new Set(); filas = filas.filter(d => { const id = d.clienteId.toHexString(); if (vistos.has(id)) return false; vistos.add(id); return true }).map(d => ({ _id: d.clienteId, pago: d })) }
        }
        return filas
      } }),
    }
  }
  const db = { collection: coleccion } as unknown as Db
  let cola = Promise.resolve()
  async function transaccion(operacion: (db: Db, session: ClientSession) => Promise<void>): Promise<void> {
    const anterior = cola
    let liberar!: () => void
    cola = new Promise<void>(resolver => { liberar = resolver })
    await anterior
    const copia = copiar(datos)
    try { await operacion(db, {} as ClientSession) } catch (error) { datos = copia; throw error } finally { liberar() }
  }
  return { db, transaccion, escrituras, documentos: (nombre: string) => copiar(datos[nombre] ?? []) }
}
