import { prepararPanel } from '../estructura.ts';
import { api, elemento, manejarFormulario, opciones, nodo, boton, acciones, avisar, fecha, nombreCompleto, ErrorAPI } from '../../compartidos/api.ts';
import { dibujarRutina } from '../../compartidos/rutinas.ts';
import type { ClienteListado, Personal, Ejercicio, Ficha, Rutina, EjercicioRutina } from '../../compartidos/modelos.ts';
let catalogo: Ejercicio[] = [];
let ficha: Ficha | undefined;
let editando: Rutina | undefined;
let entrenadores: Personal[] = [];
let rol = '', miId = '';
const formulario = elemento<HTMLFormElement>('formulario-rutina');
function campo(fila: Element, selector: string): HTMLInputElement { return fila.querySelector(selector) as HTMLInputElement; }
function cerrarEjercicio(fila: HTMLElement): boolean {
    const editor = fila.querySelector<HTMLElement>('[data-editor-ejercicio]')!;
    const invalidos = [...editor.querySelectorAll<HTMLInputElement | HTMLSelectElement>('input,select')].filter(c => !c.checkValidity());
    if (invalidos.length) {
        editor.hidden = false;
        invalidos[0]?.setAttribute('aria-invalid', 'true');
        invalidos[0]?.focus();
        avisar('Elegí el ejercicio y revisá las cantidades antes de continuar.');
        return false;
    }
    const id = campo(fila, '[data-ejercicio]').value;
    const nombre = catalogo.find(e => e._id === id)?.nombre ?? fila.querySelector<HTMLSelectElement>('[data-ejercicio]')?.selectedOptions[0]?.textContent ?? 'Ejercicio';
    fila.querySelector('[data-resumen]')!.textContent = nombre + ' · ' + campo(fila, '[data-series]').value + ' × ' + campo(fila, '[data-repeticiones]').value + ' · ' + campo(fila, '[data-peso]').value + ' kg · descanso ' + campo(fila, '[data-descanso]').value + ' s';
    editor.hidden = true;
    return true;
}
function agregarEjercicio(datos?: EjercicioRutina): void {
    const lista = elemento('ejercicios-rutina');
    if (!datos)
        for (const fila of lista.children)
            if (!cerrarEjercicio(fila as HTMLElement))
                return;
    if (lista.children.length >= 40) {
        avisar('La rutina admite hasta 40 ejercicios.');
        return;
    }
    const fila = nodo('article', '', 'ejercicio-compacto');
    const resumen = nodo('div', '', 'resumen-ejercicio'), titulo = nodo('strong', 'Nuevo ejercicio');
    titulo.dataset.resumen = '';
    const editor = nodo('div', '', 'fila-ejercicio');
    editor.dataset.editorEjercicio = '';
    editor.innerHTML = '<label class="campo">Ejercicio<select data-ejercicio required></select></label><label class="campo">Series<input data-series type="number" value="3" min="1" max="100" step="1" required></label><label class="campo">Repeticiones<input data-repeticiones type="number" value="12" min="1" max="1000" step="1" required></label><label class="campo">Peso (kg)<input data-peso type="number" value="0" min="0" max="2000" step="0.5" required></label><label class="campo">Descanso (s)<input data-descanso type="number" value="60" min="0" max="3600" step="1" required></label><label class="campo ancho">Indicaciones<input data-observaciones maxlength="500"></label>';
    const selector = editor.querySelector('select')!;
    opciones(selector, catalogo.map(e => ({ valor: e._id, texto: e.nombre + ' · ' + (e.grupoMuscular ?? '') })));
    if (datos) {
        if (!catalogo.some(e => e._id === datos.ejercicioId))
            selector.append(new Option(datos.nombre + ' (inactivo: reemplazar para guardar)', datos.ejercicioId));
        selector.value = datos.ejercicioId;
        for (const nombre of ['series', 'repeticiones', 'peso', 'descanso', 'observaciones'] as const)
            campo(editor, '[data-' + nombre + ']').value = String(datos[nombre] ?? '');
    }
    resumen.append(titulo, acciones(boton('Modificar', () => { editor.hidden = !editor.hidden; }), boton('Quitar', () => { fila.remove(); }, true)));
    editor.append(boton('Listo', () => { cerrarEjercicio(fila); }));
    fila.append(resumen, editor);
    lista.append(fila);
    if (datos)
        cerrarEjercicio(fila);
}
function nuevaRutina(): void {
    editando = undefined;
    formulario.reset();
    elemento('ejercicios-rutina').replaceChildren();
    if (rol === 'ENTRENADOR')
        elemento<HTMLSelectElement>('entrenadorId').value = miId;
    elemento('titulo-editor').textContent = 'Asignar una nueva rutina';
    elemento('guardar-rutina').textContent = 'Asignar nueva rutina';
    elemento('cancelar-edicion-rutina').hidden = true;
}
function editarRutina(rutina: Rutina): void {
    if (formulario.getAttribute('aria-busy') === 'true')
        return;
    nuevaRutina();
    editando = rutina;
    elemento<HTMLSelectElement>('entrenadorId').value = rol === 'ENTRENADOR' ? miId : rutina.entrenadorId ?? '';
    (formulario.elements.namedItem('observaciones') as HTMLTextAreaElement).value = rutina.observaciones ?? '';
    for (const ejercicio of rutina.ejercicios)
        agregarEjercicio(ejercicio);
    elemento('titulo-editor').textContent = 'Modificar rutina vigente';
    elemento('guardar-rutina').textContent = 'Guardar modificaciones';
    elemento('cancelar-edicion-rutina').hidden = false;
    elemento('editor-rutina').scrollIntoView({ block: 'start' });
}
async function cargarFicha(): Promise<void> {
    const id = elemento<HTMLSelectElement>('clienteId').value;
    elemento('historial').replaceChildren();
    elemento('editor-rutina').hidden = true;
    ficha = undefined;
    if (!id)
        return;
    ficha = (await api<{
        cliente: Ficha;
    }>('/api/ficha?clienteId=' + id)).cliente;
    elemento('nombre-ficha').textContent = nombreCompleto(ficha);
    elemento('estado-cliente').textContent = ficha.activo ? 'Ficha activa' : 'Ficha inactiva: solo consulta.';
    elemento('editor-rutina').hidden = !ficha.activo || !catalogo.length || !entrenadores.length;
    if (!entrenadores.length)
        elemento('estado-cliente').textContent += ' Creá o habilitá una cuenta ENTRENADOR para asignar rutinas.';
    const historial = elemento('historial'), vigente = ficha.rutinas.find(r => r.activo);
    const actual = nodo('article', '', 'rutina-vigente');
    actual.append(nodo('h3', 'Rutina vigente'));
    const contenido = nodo('div');
    dibujarRutina(contenido, vigente);
    actual.append(contenido);
    if (vigente?._id && ficha.activo && entrenadores.length)
        actual.append(boton('Modificar esta rutina', () => editarRutina(vigente)));
    historial.append(actual);
    const anteriores = [...ficha.rutinas].reverse().filter(r => !r.activo);
    const bloque = nodo('section', '', 'historial-rutinas no-imprimir');
    bloque.append(nodo('h3', 'Rutinas anteriores (' + anteriores.length + ')'), nodo('p', 'Abrí una rutina para consultar sus ejercicios. Se conservan hasta 12 rutinas en total.', 'ayuda'));
    for (const rutina of anteriores) {
        const detalle = nodo('details', '', 'rutina-anterior');
        detalle.append(nodo('summary', 'Ver rutina del ' + fecha(rutina.fechaAsignacion) + ' · ' + rutina.ejercicios.length + ' ejercicios'));
        const contenido = nodo('div');
        dibujarRutina(contenido, rutina);
        detalle.append(contenido);
        bloque.append(detalle);
    }
    if (!anteriores.length)
        bloque.append(nodo('p', 'Todavía no hay rutinas anteriores.', 'estado-vacio'));
    historial.append(bloque);
}
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Rutinas');
    if (!usuario)
        return;
    rol = usuario.rol;
    miId = usuario.id;
    const [clientes, ejercicios, personal] = await Promise.all([api<{
            clientes: ClienteListado[];
        }>('/api/clientes'), api<{
            ejercicios: Ejercicio[];
        }>('/api/ejercicios'), api<{
            personal: Personal[];
        }>('/api/personal')]);
    catalogo = ejercicios.ejercicios.filter(e => e.activo);
    entrenadores = personal.personal.filter(p => rol === 'ADMIN' || p._id === miId);
    opciones(elemento<HTMLSelectElement>('clienteId'), clientes.clientes.map(c => ({ valor: c.id, texto: nombreCompleto(c) + (c.activo ? '' : ' · Inactivo') })));
    opciones(elemento<HTMLSelectElement>('entrenadorId'), entrenadores.map(p => ({ valor: p._id, texto: nombreCompleto(p) })));
    manejarFormulario('formulario-rutina', async (datos) => {
        const filas = [...elemento('ejercicios-rutina').children] as HTMLElement[];
        if (!filas.length)
            throw new ErrorAPI('Agregá al menos un ejercicio.');
        for (const fila of filas)
            if (!cerrarEjercicio(fila))
                throw new ErrorAPI('Revisá los ejercicios.');
        if (!ficha?.activo)
            throw new ErrorAPI('Seleccioná una ficha activa.');
        const ejercicios = filas.map(f => ({ ejercicioId: campo(f, '[data-ejercicio]').value, series: Number(campo(f, '[data-series]').value), repeticiones: Number(campo(f, '[data-repeticiones]').value), peso: Number(campo(f, '[data-peso]').value), descanso: Number(campo(f, '[data-descanso]').value), observaciones: campo(f, '[data-observaciones]').value }));
        const r = await api('/api/rutinas', { ...datos, clienteId: ficha._id, ejercicios, ...(editando ? { rutinaId: editando._id, version: editando.version ?? 0 } : {}) });
        nuevaRutina();
        await cargarFicha();
        return r.mensaje;
    });
    elemento('agregar-ejercicio').addEventListener('click', () => agregarEjercicio());
    elemento('cancelar-edicion-rutina').addEventListener('click', nuevaRutina);
    elemento('clienteId').addEventListener('change', () => { nuevaRutina(); void cargarFicha().catch(avisar); });
    elemento('imprimir').addEventListener('click', () => window.print());
    const solicitado = new URLSearchParams(location.search).get('clienteId');
    if (solicitado)
        elemento<HTMLSelectElement>('clienteId').value = solicitado;
    nuevaRutina();
    await cargarFicha();
}
void iniciar().catch(avisar);
