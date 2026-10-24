import { pendientesDeCobro } from '../servicios/cobranza.ts';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Db, Document } from 'mongodb';
import { MongoServerError, ObjectId } from 'mongodb';
import { compare, hash } from 'bcryptjs';
import { conectarDB, ejecutarTransaccion } from '../db.ts';
import { obtenerUsuarioSesion } from './sesion.ts';
import { ErrorHTTP, responder, leerJSON, texto, identificador, entero, fechaArgentina, validarContrasena } from '../compartidos/http.ts';
import { montoDecimal, sumarMontos } from '../servicios/reglas.ts';
import { nuevaSesion, prepararSesiones, enviarCookie, esEntrenador } from '../servicios/autenticacion.ts';
import { consultarAgenda, cambiarAgenda } from '../servicios/agenda.ts';
type Usuario = NonNullable<Awaited<ReturnType<typeof obtenerUsuarioSesion>>>;
const rolesPersonal = ['ADMIN', 'ENTRENADOR'];
function exigirRol(usuario: Usuario, roles: string[]): void {
    if (!roles.includes(usuario.rol))
        throw new ErrorHTTP(403, 'No tenés permiso para acceder a este apartado.');
}
async function buscarCliente(db: Db, id: ObjectId, usuario: Usuario): Promise<Document> {
    if (usuario.rol === 'USUARIO' && usuario.clienteId !== id.toHexString()) {
        throw new ErrorHTTP(403, 'Solo podés acceder a tu propia ficha.');
    }
    const cliente = await db.collection('clientes').findOne({ _id: id });
    if (!cliente)
        throw new ErrorHTTP(404, 'La ficha no existe.');
    if (usuario.rol === 'USUARIO' && !cliente.usuarioId?.equals(new ObjectId(usuario.id))) {
        throw new ErrorHTTP(403, 'La cuenta no está vinculada a esta ficha.');
    }
    return cliente;
}
async function completarRutinas(db: Db, rutinas: Document[]): Promise<Document[]> {
    const ids = rutinas.flatMap(rutina => (rutina.ejercicios ?? []).map((ejercicio: Document) => ejercicio.ejercicioId));
    const ejercicios = await db.collection('ejercicios').find({ _id: { $in: ids } }).toArray();
    const nombres = new Map(ejercicios.map(ejercicio => [ejercicio._id.toHexString(), ejercicio.nombre]));
    return rutinas.map(rutina => ({
        ...rutina,
        ejercicios: (rutina.ejercicios ?? []).map((ejercicio: Document) => ({
            ...ejercicio, nombre: nombres.get(ejercicio.ejercicioId.toHexString()) ?? 'Ejercicio archivado',
        })),
    }));
}
async function consultarTurnos(db: Db, filtro: Document = {}): Promise<Document[]> {
    const turnos = await db.collection('turnos').find(filtro).sort({ dia: 1, horaInicio: 1 }).toArray();
    const clientes = await db.collection('clientes').find({}, { projection: { nombre: 1, apellido: 1, activo: 1 } }).toArray();
    const personal = await db.collection('usuarios').find({ rol: { $in: rolesPersonal } }, { projection: { nombre: 1, apellido: 1 } }).toArray();
    const nombres = new Map(clientes.map(cliente => [cliente._id.toHexString(), cliente]));
    const entrenadores = new Map(personal.map(usuario => [usuario._id.toHexString(), `${usuario.nombre} ${usuario.apellido}`]));
    return turnos.map(turno => ({
        ...turno,
        entrenador: entrenadores.get(turno.entrenadorId.toHexString()) ?? 'Sin entrenador disponible',
        integrantes: (turno.clientes ?? []).map((id: ObjectId) => nombres.get(id.toHexString())).filter(Boolean),
        ocupacion: (turno.clientes ?? []).length,
    }));
}
// Solo vence la última cuota de cada cliente; una renovación conserva los pagos anteriores.
export async function actualizarVencimientos(db: Db, ahora = new Date()): Promise<void> {
    const ultimas = await db.collection('pagos').aggregate([
        { $match: { tipo: 'CUOTA' } },
        { $sort: { fechaVencimiento: -1, fechaPago: -1, _id: -1 } },
        { $group: { _id: '$clienteId', pago: { $first: '$$ROOT' } } },
    ]).toArray();
    const vencidos = ultimas.filter(({ pago }) => pago.fechaVencimiento < ahora && pago.estado !== 'VENCIDO');
    await Promise.all(vencidos.map(({ pago }) => db.collection('pagos').updateOne({ _id: pago._id, estado: pago.estado, fechaVencimiento: { $lt: ahora } }, { $set: { estado: 'VENCIDO', ...(typeof pago.cobrado !== 'boolean' ? { cobrado: pago.estado === 'PAGADO' } : {}) } })));
}
// Inyección de dependencias para comprobar permisos y reglas sin escribir en Atlas.
export function crearGestorAplicacion(dependencias = {
    conectar: conectarDB, usuario: obtenerUsuarioSesion, transaccion: ejecutarTransaccion,
}) {
    return async function gestionarAplicacion(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const usuario = await dependencias.usuario(req);
            if (!usuario)
                throw new ErrorHTTP(401, 'Iniciá sesión para continuar.');
            const url = new URL(req.url ?? '/', 'http://localhost');
            const ruta = url.pathname;
            const metodo = req.method;
            const db = await dependencias.conectar();
            if (ruta === '/api/perfil' && metodo === 'GET') {
                exigirRol(usuario, ['USUARIO']);
                if (!usuario.clienteId) {
                    responder(res, 200, { cliente: null, turnos: [] });
                    return;
                }
                const cliente = await buscarCliente(db, identificador(usuario.clienteId), usuario);
                // Perfil propio: no se exponen ni cuentas de terceros ni pagos administrativos.
                const rutinas = await completarRutinas(db, cliente.rutinas ?? []);
                const turnos = await consultarTurnos(db, { activo: true, clientes: cliente._id });
                responder(res, 200, {
                    cliente: { ...cliente, rutinas },
                    turnos: cliente.activo ? turnos.map(turno => ({
                        _id: turno._id, dia: turno.dia, horaInicio: turno.horaInicio, horaFin: turno.horaFin, entrenador: turno.entrenador,
                    })) : [],
                });
                return;
            }
            if (ruta === '/api/historia-clinica') {
                if (!['GET', 'POST'].includes(metodo ?? ''))
                    throw new ErrorHTTP(405, 'Método no permitido.');
                const datos = metodo === 'POST' ? await leerJSON(req) : {};
                const id = identificador(metodo === 'POST' ? datos.clienteId : url.searchParams.get('clienteId'));
                const cliente = await buscarCliente(db, id, usuario);
                if (metodo === 'GET') {
                    responder(res, 200, { cliente: { id, nombre: cliente.nombre, apellido: cliente.apellido, activo: cliente.activo }, historia: cliente.historiaClinica ?? null });
                }
                else {
                    if (!cliente.activo)
                        throw new ErrorHTTP(409, 'La ficha está inactiva; su historia solo puede consultarse.');
                    const historia = {
                        antecedentes: texto(datos, 'antecedentes', 4000), lesiones: texto(datos, 'lesiones', 4000),
                        observaciones: texto(datos, 'observaciones', 4000), fechaActualizacion: new Date(),
                    };
                    const cambio = await db.collection('clientes').updateOne({ _id: id, activo: true }, { $set: { historiaClinica: historia, fechaModificacion: historia.fechaActualizacion } });
                    if (!cambio.matchedCount)
                        throw new ErrorHTTP(409, 'La ficha cambió. Actualizá la página.');
                    responder(res, 200, { mensaje: 'Historia clínica guardada correctamente.' });
                }
                return;
            }
            if (ruta === '/api/cuenta/contrasena' && metodo === 'POST') {
                const datos = await leerJSON(req);
                const nueva = validarContrasena(datos.contrasena);
                const actual = typeof datos.actual === 'string' ? datos.actual : '';
                if (Buffer.byteLength(actual) > 72)
                    throw new ErrorHTTP(400, 'La contraseña actual no es correcta.', ['actual']);
                const cuenta = await db.collection('usuarios').findOne({ _id: new ObjectId(usuario.id), activo: true });
                if (!cuenta || !await compare(actual, cuenta.passwordHash))
                    throw new ErrorHTTP(400, 'La contraseña actual no es correcta.', ['actual']);
                const passwordHash = await hash(nueva, 12);
                await prepararSesiones(db);
                const sesionNueva = nuevaSesion(cuenta._id);
                await dependencias.transaccion(async (base, session) => {
                    const cambio = await base.collection('usuarios').updateOne({ _id: cuenta._id, activo: true, passwordHash: cuenta.passwordHash }, { $set: { passwordHash, fechaModificacion: new Date() } }, { session });
                    if (!cambio.matchedCount)
                        throw new ErrorHTTP(409, 'La cuenta cambió. Intentá nuevamente.');
                    await base.collection('sesiones').deleteMany({ usuarioId: cuenta._id }, { session });
                    await base.collection('sesiones').insertOne(sesionNueva.documento, { session });
                });
                enviarCookie(res, sesionNueva.token);
                responder(res, 200, { mensaje: 'Contraseña actualizada. Tu sesión continúa abierta; las demás sesiones se cerraron.' });
                return;
            }
            // Todas las rutas siguientes pertenecen al personal.
            exigirRol(usuario, rolesPersonal);
            if (ruta === '/api/personal' && metodo === 'GET') {
                const personal = await db.collection('usuarios').find({ rol: { $in: rolesPersonal }, activo: true }, { projection: { nombre: 1, apellido: 1, rol: 1, esEntrenador: 1 } }).sort({ apellido: 1 }).toArray();
                responder(res, 200, { personal: personal.filter(cuenta => esEntrenador({ rol: cuenta.rol, esEntrenador: cuenta.esEntrenador })) });
                return;
            }
            if (ruta === '/api/ficha' && metodo === 'GET') {
                const cliente = await buscarCliente(db, identificador(url.searchParams.get('clienteId')), usuario);
                responder(res, 200, { cliente: { ...cliente, rutinas: await completarRutinas(db, cliente.rutinas ?? []) } });
                return;
            }
            if (ruta.startsWith('/api/ejercicios')) {
                if (ruta === '/api/ejercicios' && metodo === 'GET') {
                    responder(res, 200, { ejercicios: await db.collection('ejercicios').find({}).sort({ nombre: 1 }).toArray() });
                    return;
                }
                exigirRol(usuario, ['ADMIN']);
                if (metodo !== 'POST')
                    throw new ErrorHTTP(405, 'Método no permitido.');
                const datos = await leerJSON(req);
                if (ruta === '/api/ejercicios/estado') {
                    if (typeof datos.activo !== 'boolean')
                        throw new ErrorHTTP(400, 'Seleccioná un estado válido.');
                    const resultado = await db.collection('ejercicios').updateOne({ _id: identificador(datos.id) }, datos.activo
                        ? { $set: { activo: true, fechaModificacion: new Date() }, $unset: { fechaBaja: '' } }
                        : { $set: { activo: false, fechaBaja: new Date(), fechaModificacion: new Date() } });
                    if (!resultado.matchedCount)
                        throw new ErrorHTTP(404, 'El ejercicio no existe.');
                }
                else if (ruta === '/api/ejercicios') {
                    const campos = {
                        codigo: texto(datos, 'codigo', 30, true).toUpperCase(), nombre: texto(datos, 'nombre', 120, true),
                        descripcion: texto(datos, 'descripcion', 2000), grupoMuscular: texto(datos, 'grupoMuscular', 100, true), fechaModificacion: new Date(),
                    };
                    await db.collection('ejercicios').createIndex({ codigo: 1 }, { unique: true });
                    if (datos.id) {
                        const resultado = await db.collection('ejercicios').updateOne({ _id: identificador(datos.id) }, { $set: campos });
                        if (!resultado.matchedCount)
                            throw new ErrorHTTP(404, 'El ejercicio no existe.');
                    }
                    else
                        await db.collection('ejercicios').insertOne({ ...campos, activo: true, fechaCreacion: new Date() });
                }
                else
                    throw new ErrorHTTP(404, 'Ruta no encontrada.');
                responder(res, 200, { mensaje: 'Ejercicio guardado correctamente.' });
                return;
            }
            if (ruta === '/api/rutinas' && metodo === 'POST') {
                const datos = await leerJSON(req);
                const clienteId = identificador(datos.clienteId);
                const entrenadorId = usuario.rol === 'ENTRENADOR' ? new ObjectId(usuario.id) : identificador(datos.entrenadorId);
                if (!await db.collection('usuarios').findOne({ _id: entrenadorId, activo: true, $or: [{ rol: 'ENTRENADOR' }, { rol: 'ADMIN', esEntrenador: true }] }))
                    throw new ErrorHTTP(400, 'Seleccioná un entrenador activo.', ['entrenadorId']);
                if (!Array.isArray(datos.ejercicios) || !datos.ejercicios.length || datos.ejercicios.length > 40)
                    throw new ErrorHTTP(400, 'La rutina debe tener entre 1 y 40 ejercicios.');
                const ejercicios = datos.ejercicios.map((valor: unknown, indice: number) => {
                    if (!valor || typeof valor !== 'object' || Array.isArray(valor))
                        throw new ErrorHTTP(400, 'Revisá los ejercicios.');
                    const ejercicio = valor as Record<string, unknown>;
                    if (typeof ejercicio.peso !== 'number' || !Number.isFinite(ejercicio.peso) || ejercicio.peso < 0 || ejercicio.peso > 2000)
                        throw new ErrorHTTP(400, 'Revisá el peso de los ejercicios.');
                    return {
                        ejercicioId: identificador(ejercicio.ejercicioId), series: entero(ejercicio.series, 'series', 1, 100),
                        repeticiones: entero(ejercicio.repeticiones, 'repeticiones', 1, 1000), peso: ejercicio.peso,
                        descanso: entero(ejercicio.descanso, 'descanso', 0, 3600), orden: indice + 1, observaciones: texto(ejercicio, 'observaciones', 500),
                    };
                });
                const ids = [...new Map(ejercicios.map(ejercicio => [ejercicio.ejercicioId.toHexString(), ejercicio.ejercicioId])).values()];
                if (await db.collection('ejercicios').countDocuments({ _id: { $in: ids }, activo: true }) !== ids.length)
                    throw new ErrorHTTP(409, 'Algún ejercicio ya no está activo. Actualizá el catálogo.');
                const ahora = new Date();
                const rutina = { _id: new ObjectId(), fechaAsignacion: ahora, entrenadorId, activo: true, fechaCreacion: ahora, observaciones: texto(datos, 'observaciones', 2000), ejercicios };
                if (datos.rutinaId) {
                    const rutinaId = identificador(datos.rutinaId);
                    const version = entero(datos.version ?? 0, 'version', 0, 1000000);
                    const actual = await db.collection('clientes').findOne({ _id: clienteId, activo: true });
                    const vigente = actual?.rutinas?.find((r: Document) => r._id?.equals(rutinaId) && r.activo);
                    if (!vigente || (vigente.version ?? 0) !== version)
                        throw new ErrorHTTP(409, 'La rutina cambió. Actualizá la ficha antes de editar.');
                    const actualizado = { ...vigente, entrenadorId, ejercicios, observaciones: rutina.observaciones, fechaModificacion: ahora, version: version + 1 };
                    const cambio = await db.collection('clientes').updateOne({ _id: clienteId, activo: true, rutinas: { $elemMatch: { _id: rutinaId, activo: true, version: vigente.version ?? null } } }, [{ $set: { fechaModificacion: ahora, rutinas: { $map: { input: '$rutinas', as: 'r', in: { $cond: [{ $eq: ['$$r._id', rutinaId] }, { $literal: actualizado }, '$$r'] } } } } }]);
                    if (!cambio.matchedCount)
                        throw new ErrorHTTP(409, 'Otra persona modificó la rutina. Actualizá y volvé a intentar.');
                    responder(res, 200, { mensaje: 'Rutina vigente actualizada. Las anteriores se conservaron.' });
                    return;
                }
                // Una única actualización atómica evita dos rutinas vigentes en asignaciones simultáneas.
                const resultado = await db.collection('clientes').updateOne({ _id: clienteId, activo: true }, [{ $set: {
                            fechaModificacion: ahora,
                            rutinas: { $concatArrays: [
                                    { $slice: [{ $map: {
                                                    input: { $sortArray: { input: { $ifNull: ['$rutinas', []] }, sortBy: { fechaAsignacion: 1 } } }, as: 'rutina',
                                                    in: { $cond: ['$$rutina.activo', { $mergeObjects: ['$$rutina', { activo: false, fechaBaja: ahora }] }, '$$rutina'] },
                                                } }, -11] },
                                    { $literal: [rutina] },
                                ] },
                        } }]);
                if (!resultado.matchedCount)
                    throw new ErrorHTTP(404, 'El cliente no existe o está inactivo.');
                responder(res, 201, { mensaje: 'Rutina asignada. La anterior quedó en el historial.' });
                return;
            }
            if (ruta.startsWith('/api/turnos')) {
                if (metodo === 'GET' && ruta === '/api/turnos') {
                    responder(res, 200, { turnos: await consultarTurnos(db) });
                    return;
                }
                if (metodo === 'GET' && ruta === '/api/turnos/configuracion') {
                    exigirRol(usuario, ['ADMIN']);
                    responder(res, 200, { configuracion: await consultarAgenda(db) });
                    return;
                }
                if (metodo !== 'POST')
                    throw new ErrorHTTP(405, 'Método no permitido.');
                const mensaje = await cambiarAgenda(dependencias.transaccion, usuario, ruta, await leerJSON(req));
                responder(res, 200, { mensaje });
                return;
            }
            if (ruta.startsWith('/api/pagos') || ruta === '/api/resumen') {
                exigirRol(usuario, ['ADMIN']);
                if (ruta === '/api/pagos' && metodo === 'POST') {
                    const datos = await leerJSON(req), clienteId = identificador(datos.clienteId);
                    if (!await db.collection('clientes').findOne({ _id: clienteId, activo: true }))
                        throw new ErrorHTTP(400, 'Seleccioná un cliente activo.');
                    if (!['INSCRIPCION', 'CUOTA'].includes(String(datos.tipo)))
                        throw new ErrorHTTP(400, 'Seleccioná el tipo de pago.');
                    if (!['PAGADO', 'PENDIENTE'].includes(String(datos.estado)))
                        throw new ErrorHTTP(400, 'Seleccioná el estado del pago.');
                    const fechaPago = fechaArgentina(datos.fechaPago, 'fechaPago'), fechaVencimiento = fechaArgentina(datos.fechaVencimiento, 'fechaVencimiento', true);
                    if (fechaVencimiento < fechaPago)
                        throw new ErrorHTTP(400, 'El vencimiento no puede ser anterior al pago.', ['fechaVencimiento']);
                    const hoy = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
                    if (String(datos.fechaPago) > hoy)
                        throw new ErrorHTTP(400, 'La fecha de pago no puede ser futura.', ['fechaPago']);
                    await db.collection('pagos').insertOne({ clienteId, tipo: datos.tipo, monto: montoDecimal(datos.monto), fechaPago, fechaVencimiento, estado: datos.estado, cobrado: datos.estado === 'PAGADO', observaciones: texto(datos, 'observaciones', 2000), usuarioRegistroId: new ObjectId(usuario.id), fechaCreacion: new Date() });
                    await actualizarVencimientos(db);
                    responder(res, 201, { mensaje: 'Pago registrado correctamente.' });
                    return;
                }
                if (ruta === '/api/pagos/cobrar' && metodo === 'POST') {
                    const datos = await leerJSON(req);
                    const resultado = await db.collection('pagos').updateOne({ _id: identificador(datos.id), cobrado: false }, { $set: { cobrado: true, estado: 'PAGADO', fechaPago: new Date(), usuarioCobroId: new ObjectId(usuario.id) } });
                    if (!resultado.matchedCount)
                        throw new ErrorHTTP(409, 'El pago no existe o ya fue cobrado.');
                    await actualizarVencimientos(db);
                    responder(res, 200, { mensaje: 'Cobro registrado correctamente.' });
                    return;
                }
                if (metodo !== 'GET')
                    throw new ErrorHTTP(405, 'Método no permitido.');
                await actualizarVencimientos(db);
                const pagos = await db.collection('pagos').find({}).sort({ fechaVencimiento: -1, fechaPago: -1, _id: -1 }).toArray();
                const clientes = await db.collection('clientes').find({}, { projection: { nombre: 1, apellido: 1, activo: 1, dni: 1 } }).toArray();
                const nombres = new Map(clientes.map(cliente => [cliente._id.toHexString(), cliente]));
                const detalle: Document[] = pagos.map(pago => ({ ...pago, monto: pago.monto.toString(), cliente: nombres.get(pago.clienteId.toHexString()) }));
                if (ruta === '/api/pagos') {
                    responder(res, 200, { pagos: detalle, pendientes: await pendientesDeCobro(db) });
                    return;
                }
                if (ruta !== '/api/resumen')
                    throw new ErrorHTTP(404, 'Ruta no encontrada.');
                const ultimas = new Map<string, Document>();
                for (const pago of detalle)
                    if (pago.tipo === 'CUOTA' && !ultimas.has(pago.clienteId.toHexString()))
                        ultimas.set(pago.clienteId.toHexString(), pago);
                const ahora = new Date(), limite = new Date(ahora.getTime() + 7 * 86400000);
                const cuotas = [...ultimas.values()].filter(pago => pago.cliente?.activo);
                const vencidas = cuotas.filter(pago => pago.fechaVencimiento < ahora);
                const proximas = cuotas.filter(pago => pago.fechaVencimiento >= ahora && pago.fechaVencimiento <= limite);
                const mes = ahora.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).slice(0, 7);
                const ingresos = detalle.filter(pago => (pago.cobrado === true || (pago.cobrado === undefined && pago.estado === 'PAGADO')) && pago.fechaPago.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }).startsWith(mes));
                responder(res, 200, { pendientes: await pendientesDeCobro(db), activos: clientes.filter(cliente => cliente.activo).length, vencidas, proximas, sinCuota: clientes.filter(cliente => cliente.activo && !ultimas.has(cliente._id.toHexString())), ingresos: sumarMontos(ingresos.map(pago => pago.monto)), turnos: await consultarTurnos(db, { activo: true }) });
                return;
            }
            if (ruta.startsWith('/api/cuentas')) {
                exigirRol(usuario, ['ADMIN']);
                if (ruta === '/api/cuentas' && metodo === 'GET') {
                    const cuentas = await db.collection('usuarios').find({}, { projection: { nombre: 1, apellido: 1, email: 1, rol: 1, esEntrenador: 1, activo: 1, clienteId: 1 } }).sort({ apellido: 1 }).toArray();
                    responder(res, 200, { cuentas });
                    return;
                }
                if (metodo !== 'POST')
                    throw new ErrorHTTP(405, 'Método no permitido.');
                const datos = await leerJSON(req);
                if (ruta === '/api/cuentas') {
                    const email = texto(datos, 'email', 254, true).toLowerCase();
                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
                        throw new ErrorHTTP(400, 'Ingresá un correo válido.', ['email']);
                    if (!rolesPersonal.includes(String(datos.rol)))
                        throw new ErrorHTTP(400, 'Seleccioná un rol de personal válido.');
                    await db.collection('usuarios').createIndex({ email: 1 }, { unique: true });
                    await db.collection('usuarios').insertOne({ nombre: texto(datos, 'nombre', 100, true), apellido: texto(datos, 'apellido', 100, true), email, rol: datos.rol, esEntrenador: datos.rol === 'ADMIN' && datos.esEntrenador === true, passwordHash: await hash(validarContrasena(datos.contrasena), 12), activo: true, fechaCreacion: new Date(), fechaModificacion: new Date() });
                }
                else if (ruta === '/api/cuentas/actualizar') {
                    const id = identificador(datos.id);
                    if (!['USUARIO', 'ENTRENADOR', 'ADMIN'].includes(String(datos.rol)) || typeof datos.activo !== 'boolean')
                        throw new ErrorHTTP(400, 'Seleccioná un rol y estado válidos.');
                    if (id.toHexString() === usuario.id && (datos.rol !== 'ADMIN' || !datos.activo))
                        throw new ErrorHTTP(409, 'No podés quitarte el acceso ADMIN desde tu propia cuenta.');
                    await dependencias.transaccion(async (base, session) => {
                        await base.collection('configuracion').updateOne({ _id: new ObjectId('000000000000000000000002') }, { $inc: { revisionCuentas: 1 } }, { upsert: true, session });
                        if (!await base.collection('usuarios').findOne({ _id: new ObjectId(usuario.id), rol: 'ADMIN', activo: true }, { session }))
                            throw new ErrorHTTP(403, 'Tu cuenta ya no tiene permisos ADMIN.');
                        const cuenta = await base.collection('usuarios').findOne({ _id: id }, { session });
                        if (!cuenta)
                            throw new ErrorHTTP(404, 'La cuenta no existe.');
                        if (cuenta.rol === 'ADMIN' && cuenta.activo && (datos.rol !== 'ADMIN' || !datos.activo) && await base.collection('usuarios').countDocuments({ rol: 'ADMIN', activo: true }, { session }) <= 1)
                            throw new ErrorHTTP(409, 'Debe quedar al menos un ADMIN activo.');
                        const campos = { rol: datos.rol, esEntrenador: datos.rol === 'ADMIN' && datos.esEntrenador === true, activo: datos.activo, fechaModificacion: new Date() };
                        await base.collection('usuarios').updateOne({ _id: id }, datos.activo ? { $set: campos, $unset: { fechaBaja: '' } } : { $set: { ...campos, fechaBaja: new Date() } }, { session });
                        if (id.toHexString() !== usuario.id)
                            await base.collection('sesiones').deleteMany({ usuarioId: id }, { session });
                    });
                }
                else
                    throw new ErrorHTTP(404, 'Ruta no encontrada.');
                responder(res, 200, { mensaje: 'Cuenta actualizada correctamente.' });
                return;
            }
            throw new ErrorHTTP(404, 'Ruta no encontrada.');
        }
        catch (error) {
            if (error instanceof ErrorHTTP) {
                responder(res, error.estado, { mensaje: error.message, campos: error.campos });
                return;
            }
            if (error instanceof MongoServerError && error.code === 11000) {
                const campo = error.keyPattern?.codigo ? 'codigo' : 'email';
                responder(res, 409, { mensaje: campo === 'codigo' ? 'Ya existe un ejercicio con ese código.' : 'Ese correo ya está registrado.', campos: [campo] });
                return;
            }
            responder(res, 500, { mensaje: 'No pudimos completar la operación. Intentá nuevamente.' });
        }
    };
}
export const gestionarAplicacion = crearGestorAplicacion();
