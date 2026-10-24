import type { Db, Document } from 'mongodb';
// Un pendiente es una vista calculada de la inscripción y la vigencia.
// No inventa un pago, un importe ni una deuda contable en la base.
export async function pendientesDeCobro(db: Db, ahora = new Date()): Promise<Document[]> {
    const clientes = await db.collection('clientes').find({ activo: true }, { projection: { nombre: 1, apellido: 1, dni: 1 } }).sort({ apellido: 1, nombre: 1 }).toArray();
    const pagos = await db.collection('pagos').find({ tipo: 'CUOTA' }).sort({ fechaVencimiento: -1, fechaPago: -1, _id: -1 }).toArray();
    const ultimas = new Map<string, Document>();
    for (const pago of pagos)
        if (!ultimas.has(pago.clienteId.toHexString()))
            ultimas.set(pago.clienteId.toHexString(), pago);
    return clientes.flatMap(cliente => {
        const cuota = ultimas.get(cliente._id.toHexString());
        if (!cuota)
            return [{ cliente, motivo: 'Sin cuota registrada', montoSugerido: '' }];
        if (cuota.cobrado === false || cuota.estado === 'PENDIENTE')
            return [{ cliente, motivo: 'Cuota sin cobrar', pagoId: cuota._id, montoSugerido: cuota.monto.toString(), fechaVencimiento: cuota.fechaVencimiento }];
        if (cuota.fechaVencimiento < ahora)
            return [{ cliente, motivo: 'Renovación pendiente', montoSugerido: cuota.monto.toString(), fechaVencimiento: cuota.fechaVencimiento }];
        return [];
    });
}
