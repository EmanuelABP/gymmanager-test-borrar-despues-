import { confirmar } from '../../componentes/dialogo.ts';
import { prepararPanel } from '../estructura.ts';
import { api } from '../../servicios/api.ts';
import { elemento, manejarFormulario, opciones, tabla, acciones, boton, avisar, nombreCompleto, fecha, dinero, hoy } from '../../componentes/interfaz.ts';
import type { ClienteListado, Pago } from '../../tipos/entidades.ts';
interface Pendiente {
    cliente: {
        _id: string;
        nombre: string;
        apellido: string;
        dni: string;
    };
    motivo: string;
    tipo?: string;
    pagoId?: string;
    montoSugerido: string;
    fechaVencimiento?: string;
}
let pendientes: Pendiente[] = [];
let pagos: Pago[] = [];
const formulario = elemento<HTMLFormElement>('formulario-pago');
function mostrar(): void {
    const buscar = elemento<HTMLInputElement>('buscar').value.toLowerCase(), estado = elemento<HTMLSelectElement>('estado-filtro').value;
    tabla(elemento('listado'), ['Cliente', 'Tipo', 'Monto', 'Pago / registro', 'Vencimiento', 'Estado', 'Acciones'], pagos.filter(p => (!estado || p.estado === estado) && [p.cliente?.nombre, p.cliente?.apellido, p.cliente?.dni].join(' ').toLowerCase().includes(buscar)).map(p => [p.cliente ? nombreCompleto(p.cliente) : 'Ficha no disponible', p.tipo, dinero(p.monto), fecha(p.fechaPago), fecha(p.fechaVencimiento), p.estado + (p.cobrado === false ? ' · Sin cobrar' : ' · Cobrado'), acciones(boton('Renovar cuota', () => {
            if (formulario.getAttribute('aria-busy') === 'true')
                return;
            if (!p.cliente?.activo) {
                avisar('Reactivá la ficha para registrar una cuota nueva.');
                return;
            }
            ;
            (formulario.elements.namedItem('clienteId') as HTMLSelectElement).value = p.clienteId;
            (formulario.elements.namedItem('monto') as HTMLInputElement).value = p.monto;
            (formulario.elements.namedItem('tipo') as HTMLSelectElement).value = 'CUOTA';
            (formulario.elements.namedItem('fechaPago') as HTMLInputElement).value = hoy();
            actualizarVistaVencimiento();
            formulario.scrollIntoView({ block: 'start' });
            (formulario.elements.namedItem('monto') as HTMLInputElement).focus();
        }), ...(p.cobrado === false ? [boton('Registrar cobro', async () => {
                if (!await confirmar('¿Confirmás el cobro de ' + dinero(p.monto) + '?'))
                    return;
                const r = await api('/api/pagos/cobrar', { id: p._id });
                await cargar();
                avisar(r.mensaje, true);
            })] : []))]));
}
function prepararCobro(p: Pendiente): void {
    if (formulario.getAttribute('aria-busy') === 'true')
        return;
    formulario.reset();
    for (const [campo, valor] of Object.entries({ clienteId: p.cliente._id, tipo: 'CUOTA', monto: p.montoSugerido, fechaPago: hoy() }))
        (formulario.elements.namedItem(campo) as HTMLInputElement).value = valor;
    (formulario.elements.namedItem('tipo') as HTMLSelectElement).value = p.tipo ?? 'CUOTA';
    actualizarVistaVencimiento();
    formulario.scrollIntoView({ block: 'start' });
    (formulario.elements.namedItem('monto') as HTMLInputElement).focus();
}
function mostrarPendientes(): void {
    tabla(elemento('pendientes-cobro'), ['Cliente', 'DNI', 'Situación', 'Próximo vencimiento', 'Acción'], pendientes.map(p => [nombreCompleto(p.cliente), p.cliente.dni, p.motivo, fecha(p.fechaVencimiento), boton(p.pagoId ? 'Registrar cobro' : p.tipo === 'INSCRIPCION' ? 'Cobrar inscripción' : 'Cobrar cuota', async () => {
            if (!p.pagoId) {
                prepararCobro(p);
                return;
            }
            if (!await confirmar('¿Confirmás el cobro de ' + dinero(p.montoSugerido) + ' de ' + nombreCompleto(p.cliente) + '?', 'Registrar cobro'))
                return;
            const r = await api('/api/pagos/cobrar', { id: p.pagoId });
            await cargar();
            avisar(r.mensaje, true);
        })]));
}
async function cargar(): Promise<void> {
    const resultado = await api<{
        pagos: Pago[];
        pendientes: Pendiente[];
    }>('/api/pagos');
    pagos = resultado.pagos;
    pendientes = resultado.pendientes;
    mostrar();
    mostrarPendientes();
    actualizarVistaVencimiento();
}
async function iniciar(): Promise<void> {
    if (!await prepararPanel('Pagos', ['ADMIN']))
        return;
    const { clientes } = await api<{
        clientes: ClienteListado[];
    }>('/api/clientes');
    opciones(elemento<HTMLSelectElement>('clienteId'), clientes.filter(c => c.activo).map(c => ({ valor: c.id, texto: nombreCompleto(c) })));
    (formulario.elements.namedItem('fechaPago') as HTMLInputElement).value = hoy();
    manejarFormulario('formulario-pago', async (datos) => { const r = await api('/api/pagos', datos); formulario.reset(); (formulario.elements.namedItem('fechaPago') as HTMLInputElement).value = hoy(); await cargar(); return r.mensaje; });
    for (const nombre of ['clienteId', 'tipo', 'fechaPago']) (formulario.elements.namedItem(nombre) as HTMLInputElement).addEventListener('change', actualizarVistaVencimiento);
    formulario.addEventListener('reset', () => setTimeout(actualizarVistaVencimiento, 0));
    elemento('buscar').addEventListener('input', mostrar);
    elemento('estado-filtro').addEventListener('change', mostrar);
    elemento('imprimir').addEventListener('click', () => window.print());
    await cargar();
}
void iniciar().catch(avisar);

function actualizarVistaVencimiento(): void {
    const valor = (nombre: string) => (formulario.elements.namedItem(nombre) as HTMLInputElement).value;
    const pendiente = pendientes.find(p => p.cliente._id === valor('clienteId'));
    const base = valor('tipo') === 'CUOTA' ? pendiente?.fechaVencimiento : undefined;
    let fecha = base ? new Date(base) : new Date(valor('fechaPago') + 'T00:00:00-03:00');
    if (!base && valor('tipo') === 'INSCRIPCION') fecha = new Date(fecha.getTime() + 30 * 86400000);
    (formulario.elements.namedItem('fechaVencimiento') as HTMLInputElement).value = Number.isFinite(fecha.getTime()) ? fecha.toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' }) : '';
}
