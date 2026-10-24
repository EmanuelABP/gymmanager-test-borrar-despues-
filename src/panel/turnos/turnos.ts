import { prepararPanel } from '../estructura.ts';
import { confirmar } from '../../compartidos/dialogo.ts';
import { api, elemento, manejarFormulario, opciones, nodo, boton, acciones, tabla, avisar, nombreCompleto, ErrorAPI } from '../../compartidos/api.ts';
import type { ClienteListado, Personal, Turno } from '../../compartidos/modelos.ts';
const dias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const formulario = elemento<HTMLFormElement>('formulario-turno');
let turnos: Turno[] = [], personal: Personal[] = [];
const descripcion = (t: Turno) => t.dia + ' · ' + t.horaInicio + '–' + t.horaFin + ' · ' + t.entrenador;
function limpiarEdicion(): void { formulario.reset(); (formulario.elements.namedItem('id') as HTMLInputElement).value = ''; elemento('titulo-turno').textContent = 'Crear turno semanal'; elemento('guardar-turno').textContent = 'Crear turno'; elemento('cancelar-turno').hidden = true; }
function editar(turno: Turno): void {
    if (formulario.getAttribute('aria-busy') === 'true')
        return;
    for (const c of ['dia', 'horaInicio', 'horaFin', 'capacidad', 'entrenadorId', 'observaciones'] as const)
        (formulario.elements.namedItem(c) as HTMLInputElement).value = String(turno[c] ?? '');
    (formulario.elements.namedItem('id') as HTMLInputElement).value = turno._id;
    elemento('titulo-turno').textContent = 'Editar turno';
    elemento('guardar-turno').textContent = 'Guardar cambios';
    elemento('cancelar-turno').hidden = false;
    elemento<HTMLDetailsElement>('excepcion-turno').open = true;
    formulario.scrollIntoView({ block: 'start' });
}
function esPorHora(t: Turno): boolean { const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)); return minutos(t.horaFin) - minutos(t.horaInicio) === 60 && t.capacidad <= 5; }
function mostrar(): void {
    const filtroEntrenador = elemento<HTMLSelectElement>('filtro-entrenador').value, filtroDia = elemento<HTMLSelectElement>('filtro-dia').value, estado = elemento<HTMLSelectElement>('filtro-estado').value;
    const visibles = turnos.filter(t => (!filtroEntrenador || t.entrenadorId === filtroEntrenador) && (!filtroDia || t.dia === filtroDia) && (estado === 'todos' || t.activo === (estado === 'activos')));
    const lista = elemento('listado');
    lista.replaceChildren();
    if (!visibles.length) {
        lista.append(nodo('p', 'No hay turnos para estos filtros.', 'estado-vacio'));
        return;
    }
    const grupos = new Map<string, Turno[]>();
    for (const t of visibles) {
        const clave = t.entrenadorId + '-' + t.dia;
        grupos.set(clave, [...(grupos.get(clave) ?? []), t]);
    }
    for (const grupo of grupos.values()) {
        const bloque = nodo('article', '', 'grupo-turnos');
        bloque.append(nodo('h3', grupo[0]!.entrenador + ' · ' + grupo[0]!.dia));
        const contenido = nodo('div');
        bloque.append(contenido);
        tabla(contenido, ['Horario', 'Ocupación', 'Clientes asignados', 'Estado', 'Acciones'], grupo.map(t => {
            const cupo = nodo('div', '', 'cupo-turno');
            const progreso = nodo('progress');
            progreso.max = t.capacidad;
            progreso.value = t.ocupacion;
            progreso.setAttribute('aria-label', t.ocupacion + ' de ' + t.capacidad + ' lugares ocupados');
            cupo.append(nodo('strong', t.ocupacion + ' / ' + t.capacidad), progreso, nodo('small', Math.max(0, t.capacidad - t.ocupacion) + ' libres'));
            const clientes = nodo('div', '', 'lista-integrantes');
            if (!t.integrantes.length)
                clientes.append(nodo('span', 'Sin clientes', 'ayuda'));
            for (const c of t.integrantes)
                clientes.append(acciones(nodo('span', nombreCompleto(c)), boton('Retirar', async () => { if (!await confirmar('¿Retirar a ' + nombreCompleto(c) + ' del turno ' + t.horaInicio + '–' + t.horaFin + '?'))
                    return; const r = await api('/api/turnos/retirar', { turnoId: t._id, clienteId: c._id }); await cargar(); avisar(r.mensaje, true); }, true)));
            const botones = acciones(boton('Editar', () => editar(t)), boton(t.activo ? 'Desactivar' : 'Reactivar', async () => { if (!await confirmar('¿' + (t.activo ? 'Desactivar' : 'Reactivar') + ' este turno semanal?', t.activo ? 'Desactivar turno' : 'Reactivar turno'))
                return; const r = await api('/api/turnos/estado', { id: t._id, activo: !t.activo }); await cargar(); avisar(r.mensaje, true); }, t.activo));
            if (t.activo && t.ocupacion < t.capacidad && esPorHora(t))
                botones.prepend(boton('Asignar cliente', () => { elemento<HTMLSelectElement>('turnoId').value = t._id; elemento('formulario-asignacion').scrollIntoView({ block: 'start' }); }));
            const estado = nodo('span', t.activo ? 'Activo' : 'Inactivo', 'estado-etiqueta' + (t.activo ? '' : ' inactivo'));
            const horario = nodo('div', t.horaInicio + '–' + t.horaFin);
            if (!esPorHora(t))
                horario.append(nodo('p', 'Bloque anterior: adaptá a una hora y un máximo de 5 clientes.', 'aviso-bloque'));
            return [horario, cupo, clientes, estado, botones];
        }));
        lista.append(bloque);
    }
}
async function cargar(): Promise<void> {
    const [r, c] = await Promise.all([api<{
            turnos: Turno[];
        }>('/api/turnos'), api<{
            clientes: ClienteListado[];
        }>('/api/clientes')]);
    turnos = r.turnos.sort((a, b) => dias.indexOf(a.dia) - dias.indexOf(b.dia) || a.horaInicio.localeCompare(b.horaInicio));
    opciones(elemento<HTMLSelectElement>('turnoId'), turnos.filter(t => t.activo && t.ocupacion < t.capacidad && esPorHora(t)).map(t => ({ valor: t._id, texto: descripcion(t) + ' · ' + (t.capacidad - t.ocupacion) + ' libres' })));
    opciones(elemento<HTMLSelectElement>('clienteId'), c.clientes.filter(c => c.activo).map(c => ({ valor: c.id, texto: nombreCompleto(c) })));
    mostrar();
}
function agregarFranja(inicio = '', fin = ''): void {
    const lista = elemento('franjas-apertura');
    if (lista.children.length >= 4) {
        avisar('Podés configurar hasta cuatro franjas.');
        return;
    }
    const fila = nodo('div', '', 'franja-apertura');
    fila.innerHTML = '<label class="campo">Apertura<input type="time" data-inicio required></label><label class="campo">Cierre<input type="time" data-fin required></label>';
    fila.querySelector<HTMLInputElement>('[data-inicio]')!.value = inicio;
    fila.querySelector<HTMLInputElement>('[data-fin]')!.value = fin;
    fila.append(boton('Quitar franja', () => fila.remove(), true));
    lista.append(fila);
}
interface Configuracion {
    franjas: {
        inicio: string;
        fin: string;
    }[];
    capacidad: number;
    trabajos: {
        entrenadorId: string;
        dias: string[];
    }[];
}
async function prepararAgenda(): Promise<void> {
    elemento('configurar-agenda').hidden = false;
    const { configuracion: c } = await api<{
        configuracion: Configuracion;
    }>('/api/turnos/configuracion');
    for (const f of c.franjas)
        agregarFranja(f.inicio, f.fin);
    (elemento<HTMLFormElement>('formulario-agenda').elements.namedItem('capacidad') as HTMLInputElement).value = String(c.capacidad);
    for (const p of personal) {
        const fila = nodo('fieldset', '', 'dias-entrenador');
        fila.dataset.entrenador = p._id;
        fila.append(nodo('legend', nombreCompleto(p)));
        const marcados = c.trabajos.find(t => t.entrenadorId === p._id)?.dias ?? [];
        for (const dia of dias) {
            const etiqueta = nodo('label'), check = nodo('input');
            check.type = 'checkbox';
            check.value = dia;
            check.checked = marcados.includes(dia);
            etiqueta.append(check, document.createTextNode(dia));
            fila.append(etiqueta);
        }
        elemento('dias-entrenadores').append(fila);
    }
    if (!personal.length)
        elemento('dias-entrenadores').append(nodo('p', 'Primero creá una cuenta ENTRENADOR desde Cuentas.', 'ayuda'));
    manejarFormulario('formulario-agenda', async (datos) => {
        const franjas = [...elemento('franjas-apertura').children].map(f => ({ inicio: f.querySelector<HTMLInputElement>('[data-inicio]')!.value, fin: f.querySelector<HTMLInputElement>('[data-fin]')!.value }));
        const trabajos = [...elemento('dias-entrenadores').querySelectorAll<HTMLElement>('[data-entrenador]')].map(f => ({ entrenadorId: f.dataset.entrenador, dias: [...f.querySelectorAll<HTMLInputElement>('input:checked')].map(c => c.value) })).filter(t => t.dias.length);
        if (!trabajos.length)
            throw new ErrorAPI('Marcá los días de al menos un entrenador.');
        if (!await confirmar('Se generarán turnos de una hora para los entrenadores y días seleccionados. Se conservarán las asignaciones existentes y no se eliminarán otros horarios.', 'Generar agenda semanal'))
            return 'Generación cancelada.';
        const r = await api('/api/turnos/generar', { franjas, trabajos, capacidad: Number(datos.capacidad) });
        await cargar();
        return r.mensaje;
    });
    elemento('agregar-franja').addEventListener('click', () => agregarFranja());
}
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Turnos');
    if (!usuario)
        return;
    personal = (await api<{
        personal: Personal[];
    }>('/api/personal')).personal;
    opciones(elemento<HTMLSelectElement>('entrenadorId'), personal.map(p => ({ valor: p._id, texto: nombreCompleto(p) })));
    opciones(elemento<HTMLSelectElement>('filtro-entrenador'), personal.map(p => ({ valor: p._id, texto: nombreCompleto(p) })), 'Todos los entrenadores');
    if (usuario.rol === 'ENTRENADOR')
        elemento<HTMLSelectElement>('entrenadorId').value = usuario.id;
    if (usuario.rol === 'ADMIN')
        await prepararAgenda();
    manejarFormulario('formulario-turno', async (datos) => { const r = await api('/api/turnos', { ...datos, capacidad: Number(datos.capacidad) }); limpiarEdicion(); await cargar(); return r.mensaje; });
    manejarFormulario('formulario-asignacion', async (datos) => { const r = await api('/api/turnos/asignar', datos); await cargar(); return r.mensaje; });
    elemento('cancelar-turno').addEventListener('click', limpiarEdicion);
    for (const id of ['filtro-entrenador', 'filtro-dia', 'filtro-estado'])
        elemento(id).addEventListener('change', mostrar);
    await cargar();
}
void iniciar().catch(avisar);
