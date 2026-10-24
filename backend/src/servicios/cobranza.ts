import type { Db, Document } from 'mongodb';
export const DIAS_CUOTA = 30;
export function sumarDias(fecha: Date, dias = DIAS_CUOTA): Date { return new Date(fecha.getTime() + dias * 86400000); }
export function pagosDelCiclo(cliente: Document, pagos: Document[]): Document[] {
    return pagos.filter(p => p.clienteId.equals(cliente._id) && (cliente.cicloCuotasId ? p.cicloCuotasId?.equals(cliente.cicloCuotasId) : (!cliente.inicioCicloCuotas || (p.fechaCreacion ?? p.fechaPago) >= cliente.inicioCicloCuotas)));
}
// Los pagos anteriores siguen en el historial, pero no generan deuda tras una baja.
export function siguienteVencimiento(cliente: Document, pagos: Document[]): Date | null {
    const ciclo = pagosDelCiclo(cliente, pagos).filter(p => p.cobrado === true || (p.cobrado === undefined && p.estado === 'PAGADO'));
    const cuotas = ciclo.filter(p => p.tipo === 'CUOTA').sort((a, b) => b.fechaVencimiento - a.fechaVencimiento);
    if (cuotas[0]) return cuotas[0].finVigencia ?? cuotas[0].fechaVencimiento;
    const inscripcion = ciclo.filter(p => p.tipo === 'INSCRIPCION').sort((a, b) => a.fechaPago - b.fechaPago)[0];
    return inscripcion ? sumarDias(inscripcion.fechaPago) : null;
}
export async function pendientesDeCobro(db: Db, ahora = new Date()): Promise<Document[]> {
    const clientes = await db.collection('clientes').find({ activo: true }).sort({ apellido: 1, nombre: 1 }).toArray();
    const pagos = await db.collection('pagos').find({}).toArray();
    return clientes.map(cliente => {
        const ciclo = pagosDelCiclo(cliente, pagos);
        const sinCobrar = ciclo.find(p => p.cobrado === false || p.estado === 'PENDIENTE');
        const vencimiento = siguienteVencimiento(cliente, pagos);
        const ultimo = ciclo.filter(p => p.tipo === 'CUOTA').sort((a,b) => b.fechaVencimiento - a.fechaVencimiento)[0];
        const resumen = { _id: cliente._id, nombre: cliente.nombre, apellido: cliente.apellido, dni: cliente.dni };
        if (sinCobrar) return { cliente: resumen, motivo: 'Cuota sin cobrar', pagoId: sinCobrar._id, montoSugerido: sinCobrar.monto.toString(), fechaVencimiento: sinCobrar.fechaVencimiento };
        if (!vencimiento) return { cliente: resumen, motivo: 'Sin inscripción ni cuota en este período activo', tipo: 'INSCRIPCION', montoSugerido: '' };
        const cuotasVencidas = vencimiento < ahora ? Math.floor((ahora.getTime() - vencimiento.getTime()) / (30 * 86400000)) + 1 : 0;
        return { cliente: resumen, motivo: cuotasVencidas ? 'Renovación pendiente · ' + cuotasVencidas + ' cuota(s) vencida(s)' : 'Próxima cuota (todavía no vencida)', tipo: 'CUOTA', cuotasVencidas, montoSugerido: ultimo?.monto?.toString() ?? '', fechaVencimiento: vencimiento };
    });
}
