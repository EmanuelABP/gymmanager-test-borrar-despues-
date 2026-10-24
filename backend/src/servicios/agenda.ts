import { ObjectId } from 'mongodb';
import type { AnyBulkWriteOperation, ClientSession, Db } from 'mongodb';
import { ErrorHTTP, entero, identificador, texto } from '../compartidos/http.ts';
import type { Turno } from '../compartidos/modelos.ts';
import { diasSemana, validarHorario } from './reglas.ts';
import { esEntrenador } from './autenticacion.ts';
const idConfiguracion = new ObjectId('000000000000000000000001');
const minutos = (hora: string) => Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3));
const hora = (valor: number) => `${String(Math.floor(valor / 60)).padStart(2, '0')}:${String(valor % 60).padStart(2, '0')}`;
export const configuracionInicial = { franjas: [{ inicio: '09:00', fin: '12:00' }, { inicio: '16:00', fin: '21:00' }], capacidad: 5, trabajos: [] };
export async function consultarAgenda(db: Db) {
    return await db.collection('configuracion').findOne({ _id: idConfiguracion }) ?? configuracionInicial;
}
type Transaccion = (operacion: (db: Db, sesion: ClientSession) => Promise<void>) => Promise<void>;
export async function cambiarAgenda(transaccion: Transaccion, usuario: {
    id: string;
    rol: string;
}, ruta: string, datos: Record<string, unknown>): Promise<string> {
    let mensaje = 'Turno actualizado correctamente.';
    await transaccion(async (db, session) => {
        // Todas las escrituras de agenda usan el mismo bloqueo: serializa generación,
        // cambios y asignaciones concurrentes sin duplicar franjas ni superar cupos.
        await db.collection('configuracion').updateOne({ _id: idConfiguracion }, { $inc: { revisionAgenda: 1 } }, { upsert: true, session });
        const turnos = db.collection<Turno>('turnos');
        async function entrenador(id: ObjectId) {
            const cuenta = await db.collection('usuarios').findOne({ _id: id, activo: true }, { session });
            if (!cuenta || !esEntrenador({ rol: cuenta.rol, esEntrenador: cuenta.esEntrenador }))
                throw new ErrorHTTP(400, 'Seleccioná una cuenta con función de ENTRENADOR.', ['entrenadorId']);
        }
        function validarFranja(inicio: string, fin: string) {
            validarHorario(inicio, fin);
            if (minutos(fin) - minutos(inicio) !== 60)
                throw new ErrorHTTP(400, 'Cada turno debe durar exactamente una hora.', ['horaInicio', 'horaFin']);
        }
        async function sinSolapamientos(dia: string, inicio: string, fin: string, entrenadorId: ObjectId, omitir?: ObjectId) {
            const existentes = await turnos.find({ dia, entrenadorId, activo: true }, { session }).toArray();
            if (existentes.some(t => !t._id.equals(omitir) && t.horaInicio < fin && t.horaFin > inicio)) {
                throw new ErrorHTTP(409, `Ya existe un turno superpuesto el ${dia} entre ${inicio} y ${fin}. Revisá o desactivá el bloque anterior antes de generar horarios.`);
            }
        }
        if (ruta === '/api/turnos/generar') {
            if (usuario.rol !== 'ADMIN')
                throw new ErrorHTTP(403, 'Solo ADMIN configura los horarios del gimnasio.');
            const capacidad = entero(datos.capacidad, 'capacidad', 1, 5);
            if (!Array.isArray(datos.franjas) || datos.franjas.length < 1 || datos.franjas.length > 4)
                throw new ErrorHTTP(400, 'Indicá entre una y cuatro franjas de apertura.');
            const franjas = datos.franjas.map(valor => {
                if (!valor || typeof valor !== 'object')
                    throw new ErrorHTTP(400, 'Revisá las franjas de apertura.');
                const inicio = texto(valor, 'inicio', 5, true), fin = texto(valor, 'fin', 5, true);
                validarHorario(inicio, fin);
                if ((minutos(fin) - minutos(inicio)) % 60 !== 0)
                    throw new ErrorHTTP(400, 'Las franjas deben contener horas completas.');
                return { inicio, fin };
            }).sort((a, b) => a.inicio.localeCompare(b.inicio));
            if (franjas.some((f, i) => i > 0 && f.inicio < franjas[i - 1]!.fin))
                throw new ErrorHTTP(400, 'Las franjas de apertura no pueden superponerse.');
            if (!Array.isArray(datos.trabajos) || !datos.trabajos.length || datos.trabajos.length > 50)
                throw new ErrorHTTP(400, 'Seleccioná los días de al menos un entrenador.');
            const trabajos = datos.trabajos.map(valor => {
                if (!valor || typeof valor !== 'object' || !Array.isArray(valor.dias) || !valor.dias.length || valor.dias.some((d: unknown) => typeof d !== 'string' || !diasSemana.includes(d)))
                    throw new ErrorHTTP(400, 'Revisá los días de cada entrenador.');
                return { entrenadorId: identificador(valor.entrenadorId), dias: [...new Set(valor.dias as string[])] };
            });
            if (new Set(trabajos.map(t => t.entrenadorId.toHexString())).size !== trabajos.length)
                throw new ErrorHTTP(400, 'Un entrenador aparece repetido.');
            let creados = 0, conservados = 0;
            const existentes = await turnos.find({}, { session }).toArray();
            const cuentas = await db.collection('usuarios').find({ _id: { $in: trabajos.map(t => t.entrenadorId) }, activo: true }, { session }).toArray();
            const operaciones: AnyBulkWriteOperation<Turno>[] = [];
            for (const trabajo of trabajos) {
                const cuenta = cuentas.find(c => c._id.equals(trabajo.entrenadorId));
                if (!cuenta || !esEntrenador({ rol: cuenta.rol, esEntrenador: cuenta.esEntrenador }))
                    throw new ErrorHTTP(400, 'Seleccioná entrenadores activos.');
                for (const dia of trabajo.dias)
                    for (const franja of franjas)
                        for (let minuto = minutos(franja.inicio); minuto < minutos(franja.fin); minuto += 60) {
                            const horaInicio = hora(minuto), horaFin = hora(minuto + 60);
                            const existente = existentes.find(t => t.dia === dia && t.entrenadorId.equals(trabajo.entrenadorId) && t.horaInicio === horaInicio && t.horaFin === horaFin);
                            if (existente && (existente.clientes?.length ?? 0) > capacidad)
                                throw new ErrorHTTP(409, 'Hay un turno con más clientes que el cupo indicado. No se cambió la agenda.');
                            if (existentes.some(t => t.activo && t.dia === dia && t.entrenadorId.equals(trabajo.entrenadorId) && !t._id.equals(existente?._id) && t.horaInicio < horaFin && t.horaFin > horaInicio))
                                throw new ErrorHTTP(409, 'Hay un bloque anterior superpuesto el ' + dia + ' entre ' + horaInicio + ' y ' + horaFin + '. Editalo o desactivalo antes de generar horarios.');
                            if (existente) {
                                operaciones.push({ updateOne: { filter: { _id: existente._id }, update: { $set: { capacidad, activo: true } } } });
                                conservados++;
                            }
                            else {
                                operaciones.push({ insertOne: { document: { dia, horaInicio, horaFin, capacidad, entrenadorId: trabajo.entrenadorId, activo: true, clientes: [], historialClientes: [], origen: 'AGENDA' } } });
                                creados++;
                            }
                        }
            }
            if (operaciones.length)
                await turnos.bulkWrite(operaciones, { session });
            await db.collection('configuracion').updateOne({ _id: idConfiguracion }, { $set: { franjas, capacidad, trabajos, fechaModificacion: new Date() } }, { session });
            mensaje = `Agenda generada: ${creados} turnos nuevos y ${conservados} conservados. Las asignaciones existentes se mantuvieron.`;
            return;
        }
        if (ruta === '/api/turnos') {
            const dia = texto(datos, 'dia', 20, true);
            if (!diasSemana.includes(dia))
                throw new ErrorHTTP(400, 'Seleccioná un día válido.', ['dia']);
            const horaInicio = texto(datos, 'horaInicio', 5, true), horaFin = texto(datos, 'horaFin', 5, true);
            validarFranja(horaInicio, horaFin);
            const capacidad = entero(datos.capacidad, 'capacidad', 1, 5), entrenadorId = identificador(datos.entrenadorId);
            await entrenador(entrenadorId);
            const id = datos.id ? identificador(datos.id) : undefined;
            const existente = id ? await turnos.findOne({ _id: id }, { session }) : null;
            if (id && !existente)
                throw new ErrorHTTP(404, 'El turno no existe.');
            if (existente && existente.clientes.length > capacidad)
                throw new ErrorHTTP(409, 'El cupo no puede ser menor a la ocupación.', ['capacidad']);
            if (!existente || existente.activo)
                await sinSolapamientos(dia, horaInicio, horaFin, entrenadorId, id);
            const campos = { dia, horaInicio, horaFin, capacidad, entrenadorId, observaciones: texto(datos, 'observaciones', 2000) };
            if (id)
                await turnos.updateOne({ _id: id }, { $set: campos }, { session });
            else
                await turnos.insertOne({ ...campos, activo: true, clientes: [], historialClientes: [] }, { session });
            return;
        }
        if (ruta === '/api/turnos/estado') {
            if (typeof datos.activo !== 'boolean')
                throw new ErrorHTTP(400, 'El estado no es válido.');
            const turno = await turnos.findOne({ _id: identificador(datos.id) }, { session });
            if (!turno)
                throw new ErrorHTTP(404, 'El turno no existe.');
            if (datos.activo) {
                validarFranja(turno.horaInicio, turno.horaFin);
                if (turno.capacidad > 5)
                    throw new ErrorHTTP(409, 'Adaptá el cupo a un máximo de cinco clientes antes de reactivarlo.');
                await entrenador(turno.entrenadorId);
                await sinSolapamientos(turno.dia, turno.horaInicio, turno.horaFin, turno.entrenadorId, turno._id);
            }
            await turnos.updateOne({ _id: turno._id }, { $set: { activo: datos.activo } }, { session });
            return;
        }
        if (ruta !== '/api/turnos/asignar' && ruta !== '/api/turnos/retirar')
            throw new ErrorHTTP(404, 'Ruta no encontrada.');
        const turnoId = identificador(datos.turnoId), clienteId = identificador(datos.clienteId);
        const turno = await turnos.findOne({ _id: turnoId }, { session });
        if (!turno)
            throw new ErrorHTTP(404, 'El turno no existe.');
        const asignar = ruta.endsWith('/asignar');
        if (asignar) {
            validarFranja(turno.horaInicio, turno.horaFin);
            if (!turno.activo || turno.capacidad > 5 || turno.clientes.some(id => id.equals(clienteId)) || turno.clientes.length >= turno.capacidad)
                throw new ErrorHTTP(409, 'El turno está completo, inactivo, tiene un cupo anterior mayor a cinco o el cliente ya está asignado.');
            await entrenador(turno.entrenadorId);
            const cliente = await db.collection('clientes').updateOne({ _id: clienteId, activo: true }, { $set: { fechaModificacion: new Date() } }, { session });
            if (!cliente.matchedCount)
                throw new ErrorHTTP(409, 'El cliente no existe o está inactivo.');
            const otros = await turnos.find({ dia: turno.dia, clientes: clienteId, activo: true }, { session }).toArray();
            if (otros.some(t => t.horaInicio < turno.horaFin && t.horaFin > turno.horaInicio))
                throw new ErrorHTTP(409, 'El cliente ya tiene otro turno en ese horario.');
            await sinSolapamientos(turno.dia, turno.horaInicio, turno.horaFin, turno.entrenadorId, turno._id);
        }
        else if (!turno.clientes.some(id => id.equals(clienteId)))
            throw new ErrorHTTP(409, 'El cliente ya no está asignado.');
        await turnos.updateOne({ _id: turnoId }, {
            ...(asignar ? { $addToSet: { clientes: clienteId } } : { $pull: { clientes: clienteId } }),
            $push: { historialClientes: { clienteId, accion: asignar ? 'ALTA' : 'BAJA', fecha: new Date(), usuarioId: new ObjectId(usuario.id) } },
        }, { session });
    });
    return mensaje;
}
