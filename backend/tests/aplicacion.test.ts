import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Readable } from 'node:stream'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { BSON, Decimal128 } from 'mongodb'
import { crearGestorAplicacion, actualizarVencimientos } from '../src/controladores/aplicacion.ts'
import { crearRegistrador } from '../src/controladores/register.ts'
import { crearGestorClientes } from '../src/controladores/clientes.ts'
import { fechaArgentina } from '../src/compartidos/http.ts'
import { montoDecimal, sumarMontos } from '../src/servicios/reglas.ts'
import { memoria } from './memoria.ts'
import { semilla, usuarioSesion, id } from './fixtures.ts'
import { createHash } from 'node:crypto'
import { hash, compare } from 'bcryptjs'
import { obtenerUsuarioSesion } from '../src/controladores/sesion.ts'

function entorno(rol: string | null = 'ADMIN') {
  const almacen = memoria(semilla())
  const dependencias = { conectar: async () => almacen.db, usuario: async () => rol ? usuarioSesion(rol) : null, transaccion: almacen.transaccion }
  const aplicacion = crearGestorAplicacion(dependencias), clientes = crearGestorClientes(dependencias)
  async function pedir(ruta: string, datos?: unknown, metodo?: string) {
    const req = Readable.from(datos === undefined ? [] : [JSON.stringify(datos)]) as unknown as IncomingMessage
    req.method = metodo ?? (datos === undefined ? 'GET' : 'POST'); req.url = ruta
    req.headers = { 'content-type': 'application/json' }
    let estado = 0, cuerpo = ''
    const res = { writeHead: (codigo: number) => { estado = codigo }, end: (contenido: string) => { cuerpo = contenido }, setHeader: () => {} } as unknown as ServerResponse
    await (ruta.split('?')[0]!.startsWith('/api/clientes') ? clientes : aplicacion)(req, res)
    return { estado, datos: JSON.parse(cuerpo) }
  }
  return { ...almacen, pedir }
}

test('sin sesión se rechazan todas las áreas protegidas', async () => {
  const app = entorno(null)
  for (const ruta of ['/api/clientes', '/api/perfil', '/api/ejercicios', '/api/pagos', '/api/cuentas', '/api/resumen', '/api/turnos', '/api/historia-clinica']) {
    assert.equal((await app.pedir(ruta)).estado, 401, ruta)
  }
  assert.equal(app.escrituras.length, 0)
})

test('entrenador consulta clientes y catálogo; no administra pagos, cuentas ni catálogo', async () => {
  const app = entorno('ENTRENADOR')
  assert.equal((await app.pedir('/api/clientes')).estado, 200)
  assert.equal((await app.pedir('/api/ejercicios')).estado, 200)
  for (const ruta of ['/api/pagos', '/api/cuentas', '/api/resumen']) assert.equal((await app.pedir(ruta)).estado, 403)
  assert.equal((await app.pedir('/api/ejercicios', { nombre: 'No permitido' })).estado, 403)
  assert.equal((await app.pedir('/api/clientes', {})).estado, 403)
})

test('cliente no accede al panel ni a una historia ajena, incluso cambiando el identificador', async () => {
  const app = entorno('USUARIO')
  for (const ruta of ['/api/clientes', '/api/ejercicios', '/api/ficha?clienteId=' + id(12), '/api/turnos']) assert.equal((await app.pedir(ruta)).estado, 403)
  assert.equal((await app.pedir('/api/historia-clinica?clienteId=' + id(12))).estado, 403)
  assert.equal((await app.pedir('/api/historia-clinica', { clienteId: id(12).toHexString(), lesiones: 'No permitido' })).estado, 403)
  assert.equal(app.escrituras.length, 0)
})

test('historia propia se guarda con fecha BSON sin cambiar datos de la ficha', async () => {
  const app = entorno('USUARIO')
  const respuesta = await app.pedir('/api/historia-clinica', { clienteId: id(11).toHexString(), antecedentes: 'Antecedente', lesiones: 'Rodilla', observaciones: 'Adaptar sentadillas' })
  assert.equal(respuesta.estado, 200)
  const cliente = app.documentos('clientes')[0]!
  assert.equal(cliente.historiaClinica.lesiones, 'Rodilla')
  assert.ok(cliente.historiaClinica.fechaActualizacion instanceof Date)
  assert.equal(cliente.dni, '40111222')
  assert.deepEqual(cliente.rutinas, [])
})

test('perfil propio incluye turnos sin nombres ni fichas de los demás integrantes', async () => {
  const app = entorno('USUARIO'), r = await app.pedir('/api/perfil')
  assert.equal(r.estado, 200); assert.equal(r.datos.turnos.length, 1)
  assert.equal(r.datos.turnos[0].integrantes, undefined)
  assert.equal(r.datos.turnos[0].clientes, undefined)
  assert.equal(r.datos.cliente.dni, '40111222')
})

test('alta y edición permiten completar y limpiar teléfono y correo sin perder historia', async () => {
  const app = entorno()
  const alta = { nombre: 'María', apellido: 'Nueva', dni: '30.123.456' }
  assert.equal((await app.pedir('/api/clientes', alta)).estado, 201)
  const nueva = app.documentos('clientes').at(-1)!
  assert.equal(nueva.usuarioId, undefined)
  assert.equal(nueva.dni, '30123456')
  const clienteId = id(11).toHexString()
  const datos = { clienteId, nombre: 'Sofía', apellido: 'Cliente', dni: '40111222', telefono: '351 5555555', email: 'contacto@example.test' }
  assert.equal((await app.pedir('/api/clientes/editar', datos)).estado, 200)
  assert.equal(app.documentos('clientes')[0]!.email, datos.email)
  assert.equal((await app.pedir('/api/clientes/editar', { ...datos, telefono: '', email: '' })).estado, 200)
  const ficha = app.documentos('clientes')[0]!
  assert.equal(ficha.telefono, '')
  assert.equal(ficha.historiaClinica.antecedentes, 'Sin antecedentes declarados')
  assert.ok(ficha.usuarioId.equals(id(3)))
  assert.equal(app.documentos('usuarios')[2]!.email, 'cliente@example.test')
})

test('DNI duplicado se informa y no modifica la ficha', async () => {
  const app = entorno()
  const r = await app.pedir('/api/clientes/editar', { clienteId: id(12).toHexString(), nombre: 'Pedro', apellido: 'Gómez', dni: '40111222' })
  assert.equal(r.estado, 409); assert.deepEqual(r.datos.campos, ['dni'])
  assert.equal(app.documentos('clientes')[1]!.dni, '35222333')
})

test('baja conserva ficha y cuenta, libera cupos y registra el movimiento; reactivar no reasigna', async () => {
  const app = entorno()
  assert.equal((await app.pedir('/api/clientes/desactivar', { clienteId: id(11).toHexString() })).estado, 200)
  const ficha = app.documentos('clientes')[0]!, turno = app.documentos('turnos')[0]!
  assert.equal(ficha.activo, false); assert.ok(ficha.fechaBaja instanceof Date)
  assert.ok(ficha.historiaClinica); assert.equal(app.documentos('usuarios')[2]!.activo, true)
  assert.deepEqual(turno.clientes, []); assert.equal(turno.historialClientes[0].accion, 'BAJA_CLIENTE')
  assert.equal((await app.pedir('/api/clientes/reactivar', { clienteId: id(11).toHexString() })).estado, 200)
  assert.equal(app.documentos('clientes')[0]!.fechaBaja, undefined)
  assert.deepEqual(app.documentos('turnos')[0]!.clientes, [])
})

test('dos asignaciones simultáneas no superan el cupo ni dejan duplicados', async () => {
  const app = entorno('ENTRENADOR')
  const resultados = await Promise.all([11, 12].map(numero => app.pedir('/api/turnos/asignar', { turnoId: id(41).toHexString(), clienteId: id(numero).toHexString() })))
  assert.deepEqual(resultados.map(r => r.estado).sort(), [200, 409])
  assert.equal(app.documentos('turnos')[0]!.clientes.length, 2)
  const repetido = await app.pedir('/api/turnos/asignar', { turnoId: id(41).toHexString(), clienteId: id(12).toHexString() })
  assert.equal(repetido.estado, 409)
  assert.equal(app.documentos('turnos')[0]!.clientes.length, 2)
})

test('13 asignaciones dejan una rutina vigente y las 11 anteriores, con números BSON válidos', async () => {
  const app = entorno('ENTRENADOR')
  for (let indice = 0; indice < 13; indice++) {
    const r = await app.pedir('/api/rutinas', { clienteId: id(11).toHexString(), observaciones: '$texto literal ' + indice, ejercicios: [{ ejercicioId: id(31).toHexString(), series: 3, repeticiones: 12, peso: 12.5, descanso: 60 }] })
    assert.equal(r.estado, 201)
  }
  const rutinas = app.documentos('clientes')[0]!.rutinas
  assert.equal(rutinas.length, 12); assert.equal(rutinas.filter((r: any) => r.activo).length, 1)
  assert.equal(rutinas[0].observaciones, '$texto literal 1')
  assert.equal(rutinas.at(-1).observaciones, '$texto literal 12')
  assert.ok(rutinas[0].fechaBaja instanceof Date)
  const bson = BSON.deserialize(BSON.serialize(rutinas.at(-1).ejercicios[0]), { promoteValues: false })
  assert.equal(bson.series._bsontype, 'Int32'); assert.equal(bson.peso._bsontype, 'Double')
  const detalle = await app.pedir('/api/ficha?clienteId=' + id(11))
  assert.equal(detalle.datos.cliente.rutinas.at(-1).ejercicios[0].nombre, 'Sentadilla')
})

test('rutinas rechazan ejercicios inactivos y cantidades fraccionarias', async () => {
  const app = entorno('ENTRENADOR')
  const datos = { clienteId: id(11).toHexString(), ejercicios: [{ ejercicioId: id(31).toHexString(), series: 2.5, repeticiones: 12, peso: 0, descanso: 60 }] }
  assert.equal((await app.pedir('/api/rutinas', datos)).estado, 400)
  await app.db.collection('ejercicios').updateOne({ _id: id(31) }, { $set: { activo: false } })
  datos.ejercicios[0]!.series = 3
  assert.equal((await app.pedir('/api/rutinas', datos)).estado, 409)
  assert.equal(app.documentos('clientes')[0]!.rutinas.length, 0)
})

test('vencimientos respetan la renovación y los reportes distinguen vigencia y cobro', async () => {
  const app = entorno()
  await app.db.collection('pagos').insertOne({ clienteId: id(11), tipo: 'CUOTA', monto: Decimal128.fromString('0.10'), estado: 'PAGADO', cobrado: true, fechaPago: new Date(), fechaVencimiento: new Date(Date.now() - 86_400_000), usuarioRegistroId: id(1) })
  await actualizarVencimientos(app.db)
  assert.equal(app.documentos('pagos')[1]!.estado, 'PAGADO', 'La cuota anterior no se vence si existe una renovación vigente')
  const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' })
  const r = await app.pedir('/api/pagos', { clienteId: id(12).toHexString(), tipo: 'CUOTA', monto: '0,20', estado: 'PENDIENTE', fechaPago: hoy, fechaVencimiento: hoy })
  assert.equal(r.estado, 201)
  assert.ok(app.documentos('pagos').at(-1)!.monto instanceof Decimal128)
  const resumen = await app.pedir('/api/resumen')
  assert.equal(resumen.estado, 200); assert.equal(resumen.datos.ingresos, '25000.10')
})

test('dinero y fechas no aceptan pérdida de centavos ni días inexistentes', () => {
  assert.equal(sumarMontos(['0.10', '0.20', '123456.78']), '123457.08')
  assert.equal(montoDecimal('10,50').toString(), '10.50')
  for (const valor of ['0', '-1', '1.999', 'Infinity', '1e2']) assert.throws(() => montoDecimal(valor))
  assert.throws(() => fechaArgentina('2026-02-30', 'fecha'))
  assert.equal(fechaArgentina('2026-10-24', 'fecha').toISOString(), '2026-10-24T03:00:00.000Z')
})

test('cuentas vinculadas cambian de rol conservando la ficha; no se pierde el acceso propio ADMIN', async () => {
  const app = entorno()
  assert.equal((await app.pedir('/api/cuentas/actualizar', { id: id(3).toHexString(), rol: 'ENTRENADOR', activo: true })).estado, 200)
  assert.ok(app.documentos('usuarios')[2]!.clienteId.equals(id(11)))
  assert.ok(app.documentos('clientes')[0]!.usuarioId.equals(id(3)))
  assert.equal((await app.pedir('/api/cuentas/actualizar', { id: id(1).toHexString(), rol: 'USUARIO', activo: false })).estado, 409)
  assert.equal(app.documentos('usuarios')[0]!.activo, true)
})

test('edición de turno conserva integrantes y rechaza reducir el cupo por debajo de la ocupación', async () => {
  const app = entorno('ENTRENADOR')
  await app.pedir('/api/turnos/asignar', { turnoId: id(41).toHexString(), clienteId: id(12).toHexString() })
  const datos = { id: id(41).toHexString(), dia: 'MARTES', horaInicio: '17:00', horaFin: '18:00', capacidad: 1, entrenadorId: id(2).toHexString() }
  assert.equal((await app.pedir('/api/turnos', datos)).estado, 409)
  assert.equal(app.documentos('turnos')[0]!.dia, 'LUNES')
  assert.equal((await app.pedir('/api/turnos', { ...datos, capacidad: 3 })).estado, 200)
  assert.equal(app.documentos('turnos')[0]!.clientes.length, 2)
  assert.equal(app.documentos('turnos')[0]!.dia, 'MARTES')
})

test('sesiones ausentes, vencidas y de cuentas inactivas se rechazan; rol se consulta de nuevo', async () => {
  const token = '1'.repeat(64), datos = semilla()
  const almacen = memoria({ ...datos, sesiones: [{ usuarioId: id(3), tokenHash: createHash('sha256').update(token).digest('hex'), fechaVencimiento: new Date(Date.now() + 60_000) }] })
  const req = { headers: {} } as IncomingMessage
  assert.equal(await obtenerUsuarioSesion(req, async () => almacen.db), null)
  req.headers.cookie = 'gymmanager_sesion=' + token
  assert.equal((await obtenerUsuarioSesion(req, async () => almacen.db))?.rol, 'USUARIO')
  await almacen.db.collection('usuarios').updateOne({ _id: id(3) }, { $set: { activo: false } })
  assert.equal(await obtenerUsuarioSesion(req, async () => almacen.db), null)
  await almacen.db.collection('usuarios').updateOne({ _id: id(3) }, { $set: { activo: true, rol: 'ENTRENADOR' } })
  assert.equal((await obtenerUsuarioSesion(req, async () => almacen.db))?.rol, 'ENTRENADOR')
  await almacen.db.collection('sesiones').updateMany({}, { $set: { fechaVencimiento: new Date(Date.now() - 1000) } })
  assert.equal(await obtenerUsuarioSesion(req, async () => almacen.db), null)
})

test('cambio de contraseña verifica la actual, rota la sesión actual y cierra las anteriores', async () => {
  const app = entorno('USUARIO')
  await app.db.collection('usuarios').updateOne({ _id: id(3) }, { $set: { passwordHash: await hash('Anterior123!', 4) } })
  await app.db.collection('sesiones').insertOne({ usuarioId: id(3) })
  assert.equal((await app.pedir('/api/cuenta/contrasena', { actual: 'Incorrecta', contrasena: 'NuevaClave123!' })).estado, 400)
  assert.equal((await app.pedir('/api/cuenta/contrasena', { actual: 'Anterior123!', contrasena: 'NuevaClave123!' })).estado, 200)
  assert.ok(await compare('NuevaClave123!', app.documentos('usuarios')[2]!.passwordHash))
  assert.equal(app.documentos('sesiones').length, 1)
  assert.match(app.documentos('sesiones')[0]!.tokenHash, /^[a-f0-9]{64}$/)
})

test('registro crea cuenta y sesión atómicamente; el token se envía solo como cookie', async () => {
  const almacen = memoria(semilla())
  const gestionar = crearRegistrador({ conectar: async () => almacen.db, transaccion: almacen.transaccion })
  const req = Readable.from([JSON.stringify({ nombre: 'Nuevo', apellido: 'Usuario', email: 'nuevo@example.test', contrasena: 'Ejemplo123!' })]) as unknown as IncomingMessage
  req.method = 'POST'; req.url = '/api/usuarios/registro'; req.headers = { 'content-type': 'application/json' }
  let estado = 0, cuerpo = '', cookie = ''
  const res = { writeHead: (codigo: number) => { estado = codigo }, setHeader: (_nombre: string, valor: string) => { cookie = valor }, end: (valor: string) => { cuerpo = valor } } as unknown as ServerResponse
  await gestionar(req, res)
  assert.equal(estado, 201)
  assert.match(cookie, /gymmanager_sesion=[a-f0-9]{64}; HttpOnly/)
  assert.equal(almacen.documentos('sesiones').length, 1)
  assert.equal(almacen.documentos('usuarios').at(-1)!.rol, 'USUARIO')
  assert.equal(JSON.parse(cuerpo).token, undefined)
  const consulta = { headers: { cookie: cookie.split(';')[0] } } as IncomingMessage
  assert.equal((await obtenerUsuarioSesion(consulta, async () => almacen.db))?.email, 'nuevo@example.test')
})

test('solo ENTRENADOR y ADMIN con función de entrenador aparecen como responsables', async () => {
  const app = entorno()
  assert.deepEqual((await app.pedir('/api/personal')).datos.personal.map((p: any) => p.rol), ['ENTRENADOR'])
  assert.equal((await app.pedir('/api/cuentas/actualizar', { id: id(1).toHexString(), rol: 'ADMIN', activo: true, esEntrenador: true })).estado, 200)
  assert.equal((await app.pedir('/api/personal')).datos.personal.length, 2)
  assert.equal((await app.pedir('/api/cuentas/actualizar', { id: id(3).toHexString(), rol: 'ADMIN', activo: true })).estado, 200)
  assert.equal(app.documentos('usuarios')[2]!.rol, 'ADMIN')
})

test('editar la rutina vigente conserva su identidad, historial y protege ediciones simultáneas', async () => {
  const app = entorno('ENTRENADOR')
  const datos = { clienteId: id(11).toHexString(), ejercicios: [{ ejercicioId: id(31).toHexString(), series: 3, repeticiones: 12, peso: 0, descanso: 60 }] }
  await app.pedir('/api/rutinas', datos)
  await app.pedir('/api/rutinas', datos)
  const vigente = app.documentos('clientes')[0]!.rutinas.at(-1)
  const cambio = { ...datos, rutinaId: vigente._id.toHexString(), version: 0, observaciones: '$Texto literal editado' }
  assert.equal((await app.pedir('/api/rutinas', cambio)).estado, 200)
  const rutinas = app.documentos('clientes')[0]!.rutinas
  assert.equal(rutinas.length, 2)
  assert.ok(rutinas.at(-1)._id.equals(vigente._id))
  assert.equal(rutinas.at(-1).version, 1)
  assert.equal(rutinas.at(-1).observaciones, '$Texto literal editado')
  assert.equal((await app.pedir('/api/rutinas', cambio)).estado, 409)
})

test('agenda genera franjas por hora, conserva asignaciones y es idempotente', async () => {
  const app = entorno()
  const datos = { franjas: [{ inicio: '09:00', fin: '12:00' }, { inicio: '16:00', fin: '21:00' }], trabajos: [{ entrenadorId: id(2).toHexString(), dias: ['LUNES', 'MARTES'] }], capacidad: 5 }
  assert.equal((await app.pedir('/api/turnos/generar', datos)).estado, 200)
  assert.equal(app.documentos('turnos').length, 16)
  assert.equal((await app.pedir('/api/turnos/generar', datos)).estado, 200)
  assert.equal(app.documentos('turnos').length, 16)
  assert.equal(app.documentos('turnos').find(t => t._id.equals(id(41)))!.clientes.length, 1)
  assert.ok(app.documentos('turnos').every(t => t.capacidad === 5))
  assert.equal((await app.pedir('/api/turnos/generar', { ...datos, capacidad: 25 })).estado, 200)
  assert.ok(app.documentos('turnos').every(t => t.capacidad === 25))
  for (const capacidad of [0, -1, 1.5]) assert.equal((await app.pedir('/api/turnos/generar', { ...datos, capacidad })).estado, 400)
})

test('agenda rechaza superposiciones sin cambios parciales y protege la configuración general', async () => {
  const app = entorno()
  const datos = { franjas: [{ inicio: '18:30', fin: '19:30' }], trabajos: [{ entrenadorId: id(2).toHexString(), dias: ['LUNES'] }], capacidad: 5 }
  assert.equal((await app.pedir('/api/turnos/generar', datos)).estado, 409)
  assert.equal(app.documentos('turnos').length, 1)
  assert.equal((await entorno('ENTRENADOR').pedir('/api/turnos/generar', datos)).estado, 403)
  assert.equal((await app.pedir('/api/turnos', { dia:'LUNES', horaInicio:'18:00', horaFin:'21:00', capacidad:5, entrenadorId:id(2).toHexString() })).estado, 400)
})

test('pendientes se calculan para las fichas inscriptas sin registrar pagos ficticios', async () => {
  const app = entorno()
  const r = await app.pedir('/api/pagos')
  assert.equal(r.estado, 200)
  assert.equal(r.datos.pendientes.length, 2)
  assert.equal(r.datos.pendientes.find((p: any) => p.cliente.dni === '35222333').tipo, 'INSCRIPCION')
  assert.equal(r.datos.pendientes.find((p: any) => p.cliente.dni === '40111222').cuotasVencidas, 0)
  assert.equal(app.documentos('pagos').length, 1)
  await app.db.collection('pagos').updateMany({}, { $set: { fechaVencimiento: new Date(Date.now() - 1000) } })
  assert.equal((await app.pedir('/api/pagos')).datos.pendientes.length, 2)
})

test('un entrenador nunca supera el cupo configurado en la misma hora, incluso con solicitudes simultáneas', async () => {
  const app = entorno('ENTRENADOR')
  await app.db.collection('turnos').updateOne({ _id: id(41) }, { $set: { capacidad: 5 } })
  for (let numero = 61; numero <= 65; numero++) await app.db.collection('clientes').insertOne({ _id:id(numero), nombre:'Prueba', apellido:String(numero), dni:String(50000000+numero), activo:true, fechaCreacion:new Date(), fechaModificacion:new Date(), rutinas:[] })
  const respuestas = await Promise.all([61,62,63,64,65].map(numero => app.pedir('/api/turnos/asignar', { turnoId:id(41).toHexString(), clienteId:id(numero).toHexString() })))
  assert.equal(respuestas.filter(r => r.estado === 200).length, 4)
  assert.equal(respuestas.filter(r => r.estado === 409).length, 1)
  assert.equal(app.documentos('turnos')[0]!.clientes.length, 5)
})


test('cupo de 25 permite asignar, desactivar y reactivar sin un máximo fijo de cinco', async () => {
 const app = entorno();
 assert.equal((await app.pedir('/api/turnos', { id: id(41).toHexString(), dia:'LUNES', horaInicio:'18:00', horaFin:'19:00', capacidad:25, entrenadorId:id(2).toHexString() })).estado, 200);
 assert.equal((await app.pedir('/api/turnos/asignar', { turnoId:id(41).toHexString(), clienteId:id(12).toHexString() })).estado, 200);
 assert.equal((await app.pedir('/api/turnos/estado', { id:id(41).toHexString(), activo:false })).estado, 200);
 assert.equal((await app.pedir('/api/turnos/estado', { id:id(41).toHexString(), activo:true })).estado, 200);
});

test('ADMIN crea cuentas USUARIO sin generar una ficha; ENTRENADOR no puede crearlas', async () => {
 const datos = { nombre:'Cuenta', apellido:'Nueva', email:'nueva@example.test', rol:'USUARIO', contrasena:'Prueba1234' };
 const app = entorno(); assert.equal((await app.pedir('/api/cuentas', datos)).estado, 200);
 assert.equal(app.documentos('usuarios').at(-1)!.rol, 'USUARIO'); assert.equal(app.documentos('clientes').length, 2);
 assert.equal((await entorno('ENTRENADOR').pedir('/api/cuentas', datos)).estado, 403);
});

test('baja masiva conserva historial y borrado de turnos es atómico y exclusivo de ADMIN', async () => {
 const app = entorno(), datos = { ids:[id(41).toHexString()], eliminar:false, confirmado:true };
 assert.equal((await entorno('ENTRENADOR').pedir('/api/turnos/lote', datos)).estado, 403);
 assert.equal((await app.pedir('/api/turnos/lote', { ...datos, ids:[id(41).toHexString(), id(99).toHexString()] })).estado, 409);
 assert.equal(app.documentos('turnos')[0]!.activo, true);
 assert.equal((await app.pedir('/api/turnos/lote', datos)).estado, 200);
 assert.equal(app.documentos('turnos')[0]!.clientes.length, 1);
 assert.equal((await app.pedir('/api/turnos/lote', { ...datos, eliminar:true, confirmado:false })).estado, 400);
 assert.equal((await app.pedir('/api/turnos/lote', { ...datos, eliminar:true })).estado, 200);
 assert.equal(app.documentos('turnos').length, 0);
});

test('eliminar cliente exige baja y confirmación; borra pagos y desvincula sin borrar su cuenta', async () => {
 const app = entorno(), datos = { entidad:'clientes', id:id(11).toHexString(), confirmado:true };
 assert.equal((await app.pedir('/api/eliminar', datos)).estado, 409);
 assert.equal((await entorno('ENTRENADOR').pedir('/api/eliminar', datos)).estado, 403);
 await app.pedir('/api/clientes/desactivar', { clienteId:id(11).toHexString() });
 assert.equal((await app.pedir('/api/eliminar', { ...datos, confirmado:false })).estado, 400);
 assert.equal((await app.pedir('/api/eliminar', datos)).estado, 200);
 assert.equal(app.documentos('clientes').length, 1); assert.equal(app.documentos('pagos').length, 0);
 assert.equal(app.documentos('usuarios')[2]!.clienteId, undefined);
 assert.equal(app.documentos('turnos')[0]!.historialClientes.length, 0);
});

test('borrado de ejercicio referenciado se bloquea sin perder rutinas', async () => {
 const app = entorno();
 await app.db.collection('clientes').updateOne({ _id:id(11) }, { $set: { rutinas:[{ entrenadorId:id(2), activo:true, ejercicios:[{ ejercicioId:id(31) }] }] } });
 await app.db.collection('ejercicios').updateOne({ _id:id(31) }, { $set:{ activo:false } });
 assert.equal((await app.pedir('/api/eliminar', { entidad:'ejercicios', id:id(31).toHexString(), confirmado:true })).estado, 409);
 assert.equal(app.documentos('ejercicios').length, 1);
});

test('inscripción y cuotas conservan intervalos exactos de 30 días; la baja reinicia el ciclo', async () => {
 const app = entorno(); const clienteId = id(12).toHexString();
 const crear = (tipo: string, fechaPago: string) => app.pedir('/api/pagos', { clienteId, tipo, fechaPago, monto:'1000', estado:'PAGADO' });
 assert.equal((await crear('INSCRIPCION', '2026-01-01')).estado, 201);
 assert.equal(app.documentos('pagos').at(-1)!.fechaVencimiento.toISOString(), '2026-01-31T03:00:00.000Z');
 assert.equal((await crear('INSCRIPCION', '2026-01-02')).estado, 409);
 assert.equal((await crear('CUOTA', '2026-02-10')).estado, 201);
 const cuota = app.documentos('pagos').at(-1)!;
 assert.equal(cuota.fechaVencimiento.toISOString(), '2026-01-31T03:00:00.000Z');
 assert.equal(cuota.finVigencia.toISOString(), '2026-03-02T03:00:00.000Z');
 await app.pedir('/api/clientes/desactivar', { clienteId });
 assert.equal((await app.pedir('/api/pagos')).datos.pendientes.some((p: any) => p.cliente._id === clienteId), false);
 await app.pedir('/api/clientes/reactivar', { clienteId });
 const nuevo = (await app.pedir('/api/pagos')).datos.pendientes.find((p: any) => p.cliente._id === clienteId);
 assert.equal(nuevo.tipo, 'INSCRIPCION'); assert.equal(nuevo.cuotasVencidas, undefined);
 assert.equal(app.documentos('pagos').length, 3);
});


test('reactivar permite comenzar con una cuota de 30 días y no cobrar pendientes del ciclo anterior', async () => {
 const app = entorno(), clienteId = id(12).toHexString();
 const hoy = new Date().toLocaleDateString('sv-SE', { timeZone:'America/Argentina/Buenos_Aires' });
 const datos = { clienteId, tipo:'CUOTA', monto:'1000', estado:'PENDIENTE', fechaPago:hoy };
 assert.equal((await app.pedir('/api/pagos', datos)).estado, 201);
 const viejo = app.documentos('pagos').at(-1)!;
 await app.pedir('/api/clientes/desactivar', { clienteId });
 await app.pedir('/api/clientes/reactivar', { clienteId });
 assert.equal((await app.pedir('/api/pagos/cobrar', { id:viejo._id.toHexString() })).estado, 409);
 assert.equal((await app.pedir('/api/pagos', { ...datos, estado:'PAGADO' })).estado, 201);
 const nuevo = app.documentos('pagos').at(-1)!;
 assert.equal(nuevo.finVigencia.getTime() - fechaArgentina(hoy, 'fecha').getTime(), 30 * 86400000);
 assert.ok(nuevo.cicloCuotasId.equals(app.documentos('clientes')[1]!.cicloCuotasId));
});

test('borrar cuenta sin historial conserva su ficha y borra sus sesiones; el responsable histórico se conserva', async () => {
 const app = entorno();
 await app.db.collection('sesiones').insertOne({ usuarioId:id(3), tokenHash:'ficticio' });
 await app.db.collection('usuarios').updateOne({ _id:id(3) }, { $set:{ activo:false } });
 assert.equal((await app.pedir('/api/eliminar', { entidad:'usuarios', id:id(3).toHexString(), confirmado:true })).estado, 200);
 assert.equal(app.documentos('clientes')[0]!.usuarioId, undefined);
 assert.equal(app.documentos('sesiones').length, 0);
 await app.db.collection('usuarios').updateOne({ _id:id(2) }, { $set:{ activo:false } });
 assert.equal((await app.pedir('/api/eliminar', { entidad:'usuarios', id:id(2).toHexString(), confirmado:true })).estado, 409);
});

test('la configuración conserva sus valores iniciales si solo existen contadores internos', async () => {
 const app = entorno();
 await app.pedir('/api/turnos/estado', { id:id(41).toHexString(), activo:false });
 const r = await app.pedir('/api/turnos/configuracion');
 assert.equal(r.estado, 200); assert.equal(r.datos.configuracion.franjas.length, 2); assert.equal(r.datos.configuracion.capacidad, 5);
});


test('entrenador accede al mismo generador y conserva la configuración de los demás', async () => {
 const app = entorno('ENTRENADOR');
 const franjas = [{ inicio:'08:00', fin:'10:00' }], capacidad = 25;
 await app.db.collection('configuracion').updateOne({ _id:id(1) }, { $set:{ franjas, capacidad, trabajos:[{ entrenadorId:id(4), dias:['MARTES'] }] } }, { upsert:true });
 const configuracion = await app.pedir('/api/turnos/configuracion');
 assert.equal(configuracion.estado,200); assert.equal(configuracion.datos.configuracion.capacidad,25);
 assert.deepEqual(configuracion.datos.configuracion.trabajos,[]);
 const datos = { franjas, capacidad, trabajos:[{ entrenadorId:id(2).toHexString(),dias:['LUNES'] }] };
 assert.equal((await app.pedir('/api/turnos/generar',datos)).estado,200);
 assert.equal(app.documentos('turnos').filter(t=>t.horaInicio==='08:00'||t.horaInicio==='09:00').length,2);
 const guardada = app.documentos('configuracion').find(c=>c._id.equals(id(1)))!;
 assert.equal(guardada.capacidad,25); assert.deepEqual(guardada.franjas,franjas);
 assert.equal(guardada.trabajos.length,2); assert.ok(guardada.trabajos.some((t:any)=>t.entrenadorId.equals(id(4))));
 const propia = (await app.pedir('/api/turnos/configuracion')).datos.configuracion;
 assert.equal(propia.trabajos.length,1); assert.equal(propia.trabajos[0].entrenadorId,id(2).toHexString());
 assert.equal((await app.pedir('/api/turnos/generar',{...datos,capacidad:26})).estado,403);
 assert.equal((await app.pedir('/api/turnos/generar',{...datos,franjas:[{inicio:'07:00',fin:'10:00'}]})).estado,403);
 assert.equal((await app.pedir('/api/turnos/generar',{...datos,trabajos:[{entrenadorId:id(4).toHexString(),dias:['LUNES']}]})).estado,403);
});

test('entrenador no puede editar, reasignar, desactivar ni ocupar agendas ajenas', async () => {
 const app = entorno('ENTRENADOR');
 await app.db.collection('usuarios').insertOne({_id:id(4),nombre:'Otro',apellido:'Entrenador',email:'otro@example.test',rol:'ENTRENADOR',activo:true});
 await app.db.collection('turnos').insertOne({_id:id(42),dia:'MARTES',horaInicio:'09:00',horaFin:'10:00',capacidad:25,entrenadorId:id(4),activo:true,clientes:[id(12)],historialClientes:[]});
 const listado = await app.pedir('/api/turnos'); assert.equal(listado.datos.turnos.length,1); assert.equal(listado.datos.turnos[0]._id,id(41).toHexString());
 const cambio = {id:id(42).toHexString(),dia:'MARTES',horaInicio:'09:00',horaFin:'10:00',capacidad:25,entrenadorId:id(2).toHexString()};
 assert.equal((await app.pedir('/api/turnos',cambio)).estado,403);
 assert.equal((await app.pedir('/api/turnos',{...cambio,id:id(41).toHexString(),entrenadorId:id(4).toHexString()})).estado,403);
 assert.equal((await app.pedir('/api/turnos/estado',{id:id(42).toHexString(),activo:false})).estado,403);
 for(const accion of ['asignar','retirar'])assert.equal((await app.pedir('/api/turnos/'+accion,{turnoId:id(42).toHexString(),clienteId:id(12).toHexString()})).estado,403);
 assert.ok(app.documentos('turnos').find(t=>t._id.equals(id(42)))!.entrenadorId.equals(id(4)));
});

test('ADMIN sigue viendo y administrando todas las agendas', async () => {
 const app = entorno();
 await app.db.collection('usuarios').insertOne({_id:id(4),nombre:'Otro',apellido:'Entrenador',email:'otro@example.test',rol:'ENTRENADOR',activo:true});
 await app.db.collection('turnos').insertOne({_id:id(42),dia:'MARTES',horaInicio:'09:00',horaFin:'10:00',capacidad:25,entrenadorId:id(4),activo:true,clientes:[],historialClientes:[]});
 assert.equal((await app.pedir('/api/turnos')).datos.turnos.length,2);
 assert.equal((await app.pedir('/api/turnos/estado',{id:id(42).toHexString(),activo:false})).estado,200);
});
