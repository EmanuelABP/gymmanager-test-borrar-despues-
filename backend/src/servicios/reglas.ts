import { Decimal128 } from 'mongodb';
import { ErrorHTTP } from '../compartidos/http.ts';
export const diasSemana = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
export function validarHorario(inicio: string, fin: string): void {
    const patron = /^([01]\d|2[0-3]):[0-5]\d$/;
    if (!patron.test(inicio) || !patron.test(fin) || inicio >= fin) {
        throw new ErrorHTTP(400, 'El horario final debe ser posterior al inicial.', ['horaInicio', 'horaFin']);
    }
}
// El dinero se convierte desde texto; nunca se calcula sumando decimales binarios.
export function montoDecimal(valor: unknown): Decimal128 {
    if (typeof valor !== 'string' || !/^\d{1,9}([.,]\d{1,2})?$/.test(valor) || /^0+([.,]0{1,2})?$/.test(valor)) {
        throw new ErrorHTTP(400, 'Ingresá un monto positivo con hasta dos decimales.', ['monto']);
    }
    return Decimal128.fromString(valor.replace(',', '.'));
}
export function sumarMontos(valores: string[]): string {
    const centavos = valores.reduce((total, valor) => {
        const [entero = '0', decimales = ''] = valor.split('.');
        return total + BigInt(entero) * 100n + BigInt(decimales.padEnd(2, '0').slice(0, 2));
    }, 0n);
    return `${centavos / 100n}.${(centavos % 100n).toString().padStart(2, '0')}`;
}
