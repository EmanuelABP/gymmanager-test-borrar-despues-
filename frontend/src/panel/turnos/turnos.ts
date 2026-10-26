import { prepararPanel } from '../estructura.ts';
import { confirmar } from '../../componentes/dialogo.ts';
import { api, ErrorAPI } from '../../servicios/api.ts';
import { elemento, manejarFormulario, opciones, nodo, boton, acciones, tabla, avisar, nombreCompleto } from '../../componentes/interfaz.ts';
import type { ClienteListado, Personal, Turno } from '../../tipos/entidades.ts';
const dias = ['LUNES', 'MARTES', 'MIERCOLES', 'JUEVES', 'VIERNES', 'SABADO', 'DOMINGO'];
const formulario = elemento<HTMLFormElement>('formulario-edicion-turno');
let turnos: Turno[] = [], personal: Personal[] = [];
let administrador = false;
const seleccionados = new Set<string>();
let visiblesActuales: Turno[] = [];
function contarSeleccion(): void { elemento('cantidad-seleccionados').textContent = seleccionados.size + ' seleccionados'; }
const descripcion = (t: Turno) => t.dia + ' · ' + t.horaInicio + '–' + t.horaFin + ' · ' + t.entrenador;
function limpiarEdicion(): void {
    formulario.reset();
    (formulario.elements.namedItem('id') as HTMLInputElement).value = '';
    const editor = elemento<HTMLDetailsElement>('editor-turno');
    editor.open = false;
    editor.hidden = true;
}
function editar(turno: Turno): void {
    if (formulario.getAttribute('aria-busy') === 'true')
        return;
    for (const c of ['dia', 'horaInicio', 'horaFin', 'capacidad', 'entrenadorId', 'observaciones'] as const)
        (formulario.elements.namedItem(c) as HTMLInputElement).value = String(turno[c] ?? '');
    (formulario.elements.namedItem('id') as HTMLInputElement).value = turno._id;
    elemento('titulo-turno').textContent = 'Editar turno';
    elemento('guardar-turno').textContent = 'Guardar cambios';
    elemento('cancelar-turno').hidden = false;
    elemento<HTMLDetailsElement>('editor-turno').hidden = false;
    elemento<HTMLDetailsElement>('editor-turno').open = true;
    formulario.scrollIntoView({ block: 'start' });
}
function esPorHora(t: Turno): boolean { const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3)); return minutos(t.horaFin) - minutos(t.horaInicio) === 60; }
function mostrar(): void {
    const filtroEntrenador = elemento<HTMLSelectElement>('filtro-entrenador').value, filtroDia = elemento<HTMLSelectElement>('filtro-dia').value, estado = elemento<HTMLSelectElement>('filtro-estado').value;
    const visibles = turnos.filter(t => (!filtroEntrenador || t.entrenadorId === filtroEntrenador) && (!filtroDia || t.dia === filtroDia) && (estado === 'todos' || t.activo === (estado === 'activos')));
    visiblesActuales = visibles;
    contarSeleccion();
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
                clientes.append(acciones(nodo('span', nombreCompleto(c)), boton('Retirar', async () => {
                    if (!await confirmar('¿Retirar a ' + nombreCompleto(c) + ' del turno ' + t.horaInicio + '–' + t.horaFin + '?'))
                        return;
                    const r = await api('/api/turnos/retirar', { turnoId: t._id, clienteId: c._id });
                    await cargar();
                    avisar(r.mensaje, true);
                }, true)));
            const botones = acciones(boton('Editar', () => editar(t)), boton(t.activo ? 'Desactivar' : 'Reactivar', async () => {
                if (!await confirmar('¿' + (t.activo ? 'Desactivar' : 'Reactivar') + ' este turno semanal?', t.activo ? 'Desactivar turno' : 'Reactivar turno'))
                    return;
                const r = await api('/api/turnos/estado', { id: t._id, activo: !t.activo });
                await cargar();
                avisar(r.mensaje, true);
            }, t.activo));
            if (t.activo && t.ocupacion < t.capacidad && esPorHora(t))
                botones.prepend(boton('Asignar cliente', () => { elemento<HTMLSelectElement>('turnoId').value = t._id; elemento('formulario-asignacion').scrollIntoView({ block: 'start' }); }));
            const estado = nodo('span', t.activo ? 'Activo' : 'Inactivo', 'estado-etiqueta' + (t.activo ? '' : ' inactivo'));
            const horario = nodo('div', t.horaInicio + '–' + t.horaFin);
            if (!esPorHora(t))
                horario.append(nodo('p', 'Bloque anterior: adaptá a una hora.', 'aviso-bloque'));
            if (administrador) {
                const elegir = nodo('input');
                elegir.type = 'checkbox';
                elegir.checked = seleccionados.has(t._id);
                elegir.setAttribute('aria-label', 'Seleccionar ' + descripcion(t));
                elegir.addEventListener('change', () => { if (elegir.checked)
                    seleccionados.add(t._id);
                else
                    seleccionados.delete(t._id); contarSeleccion(); });
                horario.prepend(elegir, document.createTextNode(' '));
            }
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
    seleccionados.clear();
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
    if (administrador)
        fila.append(boton('Quitar franja', () => fila.remove(), true));
    else
        for (const campo of fila.querySelectorAll<HTMLInputElement>('input'))
            campo.readOnly = true;
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
    elemento('acciones-apertura').hidden = !administrador;
    if (!administrador) {
        elemento('ayuda-agenda').textContent = 'Elegí tus días y generá tu agenda con los horarios de apertura y el cupo definidos por administración. Las asignaciones existentes se conservan.';
        (elemento<HTMLFormElement>('formulario-agenda').elements.namedItem('capacidad') as HTMLInputElement).readOnly = true;
    }
    const { configuracion: c } = await api<{
        configuracion: Configuracion;
    }>('/api/turnos/configuracion');
    for (const f of c.franjas)
        agregarFranja(f.inicio, f.fin);
    (elemento<HTMLFormElement>('formulario-agenda').elements.namedItem('capacidad') as HTMLInputElement).value = String(c.capacidad);
    const diasElegidos = new Set(c.trabajos.flatMap(t => t.dias));
    for (const dia of dias) {
        const etiqueta = nodo('label'), check = nodo('input');
        check.type = 'checkbox';
        check.value = dia;
        check.checked = diasElegidos.has(dia);
        etiqueta.append(check, document.createTextNode(dia));
        elemento('dias-comunes').append(etiqueta);
    }
    const contar = () => { elemento('cantidad-entrenadores').textContent = '(' + elemento('dias-entrenadores').querySelectorAll('input:checked').length + ')'; };
    for (const p of personal) {
        const etiqueta = nodo('label'), check = nodo('input');
        check.type = 'checkbox';
        check.value = p._id;
        check.checked = !administrador || c.trabajos.some(t => t.entrenadorId === p._id);
        check.disabled = !administrador;
        check.addEventListener('change', contar);
        etiqueta.append(check, document.createTextNode(nombreCompleto(p)));
        elemento('dias-entrenadores').append(etiqueta);
    }
    contar();
    if (!personal.length)
        elemento('dias-entrenadores').append(nodo('p', 'Primero creá una cuenta ENTRENADOR desde Cuentas.', 'ayuda'));
    manejarFormulario('formulario-agenda', async (datos) => {
        const franjas = [...elemento('franjas-apertura').children].map(f => ({ inicio: f.querySelector<HTMLInputElement>('[data-inicio]')!.value, fin: f.querySelector<HTMLInputElement>('[data-fin]')!.value }));
        const diasMarcados = [...elemento('dias-comunes').querySelectorAll<HTMLInputElement>('input:checked')].map(c => c.value);
        if (!diasMarcados.length)
            throw new ErrorAPI('Seleccioná al menos un día.');
        const trabajos = [...elemento('dias-entrenadores').querySelectorAll<HTMLInputElement>('input:checked')].map(c => ({ entrenadorId: c.value, dias: diasMarcados }));
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
    administrador = usuario.rol === 'ADMIN';
    personal = (await api<{
        personal: Personal[];
    }>('/api/personal')).personal.filter(p => administrador || p._id === usuario.id);
    opciones(elemento<HTMLSelectElement>('entrenadorId'), personal.map(p => ({ valor: p._id, texto: nombreCompleto(p) })));
    opciones(elemento<HTMLSelectElement>('filtro-entrenador'), personal.map(p => ({ valor: p._id, texto: nombreCompleto(p) })), 'Todos los entrenadores');
    if (usuario.rol === 'ENTRENADOR')
        elemento<HTMLSelectElement>('entrenadorId').value = usuario.id;
    await prepararAgenda();
    if (administrador) {
        elemento('acciones-masivas').hidden = false;
        elemento('seleccionar-visibles').addEventListener('click', () => {
            const todos = visiblesActuales.every(t => seleccionados.has(t._id));
            for (const t of visiblesActuales) {
                if (todos)
                    seleccionados.delete(t._id);
                else
                    seleccionados.add(t._id);
            }
            mostrar();
        });
        elemento('baja-seleccion').addEventListener('click', () => void cambiarSeleccion(false).catch(avisar));
        elemento('borrar-seleccion').addEventListener('click', () => void cambiarSeleccion(true).catch(avisar));
    }
    manejarFormulario('formulario-edicion-turno', async (datos) => { if (!datos.id)
        throw new ErrorAPI('Seleccioná un turno del listado para editar.'); const r = await api('/api/turnos', { ...datos, capacidad: Number(datos.capacidad) }); limpiarEdicion(); await cargar(); return r.mensaje; });
    manejarFormulario('formulario-asignacion', async (datos) => { const r = await api('/api/turnos/asignar', datos); await cargar(); return r.mensaje; });
    elemento('cancelar-turno').addEventListener('click', limpiarEdicion);
    for (const id of ['filtro-entrenador', 'filtro-dia', 'filtro-estado'])
        elemento(id).addEventListener('change', mostrar);
    await cargar();
}
void iniciar().catch(avisar);
let cambiandoSeleccion = false;
async function cambiarSeleccion(eliminar: boolean): Promise<void> {
    if (cambiandoSeleccion)
        return;
    if (!seleccionados.size)
        throw new ErrorAPI('Seleccioná uno o más turnos. Podés filtrar por entrenador y seleccionar todos los visibles.');
    const ids = [...seleccionados];
    if (!await confirmar(eliminar ? 'Vas a eliminar definitivamente ' + ids.length + ' turnos, sus asignaciones e historial. No podrás recuperarlos. Esta acción es irreversible.' : '¿Dar de baja ' + ids.length + ' turnos? Se conservará su historial y dejarán de aparecer en los perfiles.', eliminar ? 'Eliminar definitivamente' : 'Dar de baja turnos'))
        return;
    cambiandoSeleccion = true;
    try {
        const r = await api('/api/turnos/lote', { ids, eliminar, confirmado: true });
        await cargar();
        avisar(r.mensaje, true);
    }
    finally {
        cambiandoSeleccion = false;
    }
}
