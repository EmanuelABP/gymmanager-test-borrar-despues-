import { ObjectId } from 'mongodb';
import type { Db, ClientSession } from 'mongodb';
import type { Turno } from '../compartidos/modelos.ts';
import { ErrorHTTP, identificador } from '../compartidos/http.ts';

// El borrado definitivo es explícito y atómico. La baja lógica sigue siendo la opción normal.
export async function eliminarRegistro(transaccion: (fn: (db: Db, session: ClientSession) => Promise<void>) => Promise<void>, actor: string, datos: Record<string, unknown>): Promise<void> {
    if (datos.confirmado !== true || !['clientes', 'usuarios', 'ejercicios'].includes(String(datos.entidad)))
        throw new ErrorHTTP(400, 'Confirmá qué registro querés eliminar definitivamente.');
    const id = identificador(datos.id), entidad = String(datos.entidad);
    await transaccion(async (db, session) => {
        // Mismos bloqueos que los cambios de permisos y agenda.
        for (const sufijo of ['000001', '000002'])
            await db.collection('configuracion').updateOne({ _id: new ObjectId('000000000000000000' + sufijo) }, { $inc: { revisionEliminaciones: 1 } }, { upsert: true, session });
        if (!await db.collection('usuarios').findOne({ _id: new ObjectId(actor), rol: 'ADMIN', activo: true }, { session }))
            throw new ErrorHTTP(403, 'Solo un ADMIN activo puede eliminar definitivamente.');
        const registro = await db.collection(entidad).findOne({ _id: id }, { session });
        if (!registro) throw new ErrorHTTP(404, 'El registro ya no existe.');
        if (registro.activo !== false) throw new ErrorHTTP(409, 'Primero dale de baja. Solo se eliminan registros inactivos.');
        if (entidad === 'clientes') {
            await db.collection('usuarios').updateMany({ clienteId: id }, { $unset: { clienteId: '' }, $set: { fechaModificacion: new Date() } }, { session });
            await db.collection<Turno>('turnos').updateMany({}, { $pull: { clientes: id, historialClientes: { clienteId: id } } }, { session });
            await db.collection('pagos').deleteMany({ clienteId: id }, { session });
        } else if (entidad === 'usuarios') {
            if (id.toHexString() === actor) throw new ErrorHTTP(409, 'No podés eliminar tu propia cuenta.');
            const fichas = await db.collection('clientes').find({}, { session }).toArray();
            if (fichas.some(c => c.rutinas?.some((r: { entrenadorId?: ObjectId }) => r.entrenadorId?.equals(id))) || await db.collection('turnos').countDocuments({ entrenadorId: id }, { session }) || await db.collection('pagos').countDocuments({ $or: [{ usuarioRegistroId: id }, { usuarioCobroId: id }] }, { session }))
                throw new ErrorHTTP(409, 'Esta cuenta figura como responsable en rutinas, turnos o pagos. Conservá su baja lógica para mantener ese historial.');
            await db.collection('clientes').updateMany({ usuarioId: id }, { $unset: { usuarioId: '' }, $set: { fechaModificacion: new Date() } }, { session });
            await db.collection('sesiones').deleteMany({ usuarioId: id }, { session });
        } else {
            const fichas = await db.collection('clientes').find({}, { session }).toArray();
            if (fichas.some(c => c.rutinas?.some((r: { ejercicios?: { ejercicioId: ObjectId }[] }) => r.ejercicios?.some(e => e.ejercicioId.equals(id)))))
                throw new ErrorHTTP(409, 'El ejercicio forma parte de una rutina actual o anterior. Conservá su baja lógica.');
        }
        await db.collection(entidad).deleteOne({ _id: id, activo: false }, { session });
    });
}
