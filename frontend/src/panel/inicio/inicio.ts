import { prepararPanel } from '../estructura.ts';
import { api } from '../../servicios/api.ts';
import { elemento, nodo, tabla, enlace, avisar, dinero, fecha, nombreCompleto } from '../../componentes/interfaz.ts';
import type { Pago, Ficha, Turno, ClienteListado } from '../../tipos/entidades.ts';
interface Resumen {
    pendientes: unknown[];
    activos: number;
    vencidas: Pago[];
    proximas: Pago[];
    sinCuota: Ficha[];
    ingresos: string;
    turnos: Turno[];
}
function indicador(titulo: string, valor: string): void {
    const tarjeta = nodo('article', '', 'tarjeta indicador');
    if (titulo === 'Ingresos del mes') tarjeta.classList.add('indicador-dinero');
    tarjeta.append(nodo('span', titulo), nodo('strong', valor));
    elemento('indicadores').append(tarjeta);
}
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Inicio');
    if (!usuario)
        return;
    elemento('saludo').textContent = 'Hola, ' + usuario.nombre;
    elemento('descripcion-inicio').textContent = usuario.rol === 'ADMIN' ? 'El estado de tu gimnasio, en un solo lugar. Las alertas corresponden al próximo vencimiento del ciclo de cada cliente activo.' : 'Tus turnos y las herramientas para acompañar a cada cliente.';
    const accesos = elemento('accesos');
    for (const [titulo, ruta] of [['Ver clientes', 'clientes'], ['Asignar rutina', 'rutinas'], ['Gestionar turnos', 'turnos']])
        accesos.append(enlace(titulo!, '../' + ruta + '/' + ruta + '.html'));
    if (usuario.rol === 'ADMIN') {
        accesos.append(enlace('Registrar pago', '../pagos/pagos.html'));
        const r = await api<Resumen>('/api/resumen');
        indicador('Clientes activos', String(r.activos));
        indicador('Cuotas a cobrar', String(r.pendientes.length));
        indicador('Cuotas vencidas', String(r.vencidas.length));
        indicador('Vencen en 7 días', String(r.proximas.length));
        indicador('Ingresos del mes', dinero(r.ingresos));
        indicador('Turnos activos', String(r.turnos.length));
        for (const [id, pagos] of [['vencidas', r.vencidas], ['proximas', r.proximas]] as const)
            tabla(elemento(id), ['Cliente', 'Vencimiento', 'Acción'], pagos.map(p => [p.cliente ? nombreCompleto(p.cliente) : '—', fecha(p.fechaVencimiento), enlace('Ver pagos', '../pagos/pagos.html')]));
        tabla(elemento('sin-cuota'), ['Cliente', 'DNI'], r.sinCuota.map(c => [nombreCompleto(c), c.dni]));
        tabla(elemento('ocupacion'), ['Día', 'Horario', 'Lugares'], r.turnos.map(t => [t.dia, t.horaInicio + '–' + t.horaFin, t.ocupacion + ' / ' + t.capacidad]));
        elemento('reportes').hidden = false;
    }
    else {
        const [turnos, clientes] = await Promise.all([api<{
                turnos: Turno[];
            }>('/api/turnos'), api<{
                clientes: ClienteListado[];
            }>('/api/clientes')]);
        const propios = turnos.turnos.filter(t => t.entrenadorId === usuario.id && t.activo);
        indicador('Mis turnos', String(propios.length));
        indicador('Clientes activos', String(clientes.clientes.filter(c => c.activo).length));
        tabla(elemento('mis-turnos'), ['Día', 'Horario', 'Ocupación'], propios.map(t => [t.dia, t.horaInicio + '–' + t.horaFin, t.ocupacion + ' / ' + t.capacidad]));
        elemento('agenda-entrenador').hidden = false;
    }
}
void iniciar().catch(avisar);
