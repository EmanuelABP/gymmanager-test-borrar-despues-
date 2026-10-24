import { confirmar } from '../../compartidos/dialogo.ts'
import { prepararPanel } from '../estructura.ts';
import { api, elemento, manejarFormulario, tabla, boton, acciones, avisar } from '../../compartidos/api.ts';
import type { Ejercicio } from '../../compartidos/modelos.ts';
let ejercicios: Ejercicio[] = [];
let administrador = false;
const formulario = elemento<HTMLFormElement>('formulario-ejercicio');
function mostrar(): void {
    const buscar = elemento<HTMLInputElement>('buscar').value.toLowerCase();
    tabla(elemento('listado'), ['Código', 'Ejercicio', 'Grupo muscular', 'Descripción', 'Estado', 'Acciones'], ejercicios.filter(e => [e.codigo, e.nombre, e.grupoMuscular].join(' ').toLowerCase().includes(buscar)).map(e => [e.codigo, e.nombre, e.grupoMuscular, e.descripcion || '—', e.activo ? 'Activo' : 'Inactivo', administrador ? acciones(boton('Editar', () => {
            if (formulario.getAttribute('aria-busy') === 'true')
                return;
            for (const nombre of ['codigo', 'nombre', 'grupoMuscular', 'descripcion'] as const)
                (formulario.elements.namedItem(nombre) as HTMLInputElement).value = e[nombre] ?? '';
            (formulario.elements.namedItem('id') as HTMLInputElement).value = e._id;
            formulario.scrollIntoView({ block: 'start' });
        }), boton(e.activo ? 'Dar de baja' : 'Reactivar', async () => {
            if (!await confirmar('¿Cambiar el estado de ' + e.nombre + '?'))
                return;
            const resultado = await api('/api/ejercicios/estado', { id: e._id, activo: !e.activo });
            await cargar();
            avisar(resultado.mensaje, true);
        }, e.activo), ...(!e.activo ? [boton('Eliminar definitivamente', async () => {
            if (!await confirmar('El ejercicio ' + e.nombre + ' se eliminará para siempre. No podrás recuperarlo. Solo se permite si no figura en ninguna rutina.', 'Eliminar ejercicio definitivamente')) return;
            const r = await api('/api/eliminar', { entidad: 'ejercicios', id: e._id, confirmado: true }); await cargar(); avisar(r.mensaje, true);
        }, true)] : [])) : 'Solo consulta']));
}
async function cargar(): Promise<void> { ejercicios = (await api<{
    ejercicios: Ejercicio[];
}>('/api/ejercicios')).ejercicios; mostrar(); }
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Ejercicios');
    if (!usuario)
        return;
    administrador = usuario.rol === 'ADMIN';
    elemento('tarjeta-editor').hidden = !administrador;
    elemento('tarjeta-importacion').hidden = !administrador;
    if (administrador) prepararImportacion();
    manejarFormulario('formulario-ejercicio', async (datos, form) => { const r = await api('/api/ejercicios', datos); form.reset(); await cargar(); return r.mensaje; });
    elemento('buscar').addEventListener('input', mostrar);
    await cargar();
}
void iniciar().catch(avisar);

interface FilaExcel { fila: number; codigo: string; nombre: string; grupoMuscular: string; descripcion: string; error: string; }
let filasExcel: FilaExcel[] = [];
let importando = false;
function prepararImportacion(): void {
    const archivo = elemento<HTMLInputElement>('archivo-ejercicios');
    const confirmarCarga = elemento<HTMLButtonElement>('importar-ejercicios');
    const estado = elemento('estado-importacion');
    archivo.addEventListener('change', () => void (async () => {
        filasExcel = []; confirmarCarga.disabled = true; elemento('vista-importacion').replaceChildren();
        const fichero = archivo.files?.[0]; if (!fichero) return;
        if (!/\.xlsx$/i.test(fichero.name) || fichero.size > 2 * 1024 * 1024) throw new Error('Elegí un archivo .xlsx de hasta 2 MB.');
        estado.textContent = 'Leyendo archivo…';
        const { default: ExcelJS } = await import('exceljs');
        const libro = new ExcelJS.Workbook(); await libro.xlsx.load(await fichero.arrayBuffer());
        const hoja = libro.worksheets[0]; if (!hoja) throw new Error('El archivo no contiene hojas.');
        if (hoja.rowCount > 1001 || hoja.columnCount > 30) throw new Error('El archivo admite hasta 1000 filas de ejercicios y 30 columnas.');
        const normalizar = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[\s_-]/g, '');
        const columnas = new Map<string, number>();
        hoja.getRow(1).eachCell((celda, indice) => { const clave = normalizar(celda.text); if (columnas.has(clave)) throw new Error('Hay encabezados repetidos.'); columnas.set(clave, indice); });
        for (const clave of ['codigo', 'nombre', 'grupomuscular', 'descripcion']) if (!columnas.has(clave)) throw new Error('Falta la columna ' + clave + '.');
        const usados = new Set(ejercicios.map(e => e.codigo.toUpperCase()));
        hoja.eachRow((fila, numero) => {
            if (numero === 1) return;
            const leer = (clave: string) => fila.getCell(columnas.get(clave)!).text.trim();
            const datos = { fila: numero, codigo: leer('codigo').toUpperCase(), nombre: leer('nombre'), grupoMuscular: leer('grupomuscular'), descripcion: leer('descripcion'), error: '' };
            if (![datos.codigo, datos.nombre, datos.grupoMuscular, datos.descripcion].some(Boolean)) return;
            if (!datos.codigo || datos.codigo.length > 30 || !datos.nombre || datos.nombre.length > 120 || !datos.grupoMuscular || datos.grupoMuscular.length > 100 || datos.descripcion.length > 2000) datos.error = 'Campos vacíos o demasiado largos';
            else if (usados.has(datos.codigo)) datos.error = 'Código repetido: se omitirá';
            usados.add(datos.codigo); filasExcel.push(datos);
        });
        tabla(elemento('vista-importacion'), ['Fila', 'Código', 'Nombre', 'Grupo muscular', 'Revisión'], filasExcel.map(f => [String(f.fila), f.codigo, f.nombre, f.grupoMuscular, f.error || 'Lista para cargar']));
        const validas = filasExcel.filter(f => !f.error).length;
        estado.textContent = validas + ' listas para cargar; ' + (filasExcel.length - validas) + ' omitidas. Revisá la vista previa antes de confirmar.';
        confirmarCarga.disabled = validas === 0;
    })().catch(error => { estado.textContent = error instanceof Error ? error.message : 'No se pudo leer el archivo.'; }));
    confirmarCarga.addEventListener('click', () => void (async () => {
        if (importando) return;
        const validas = filasExcel.filter(f => !f.error); if (!validas.length) return;
        if (!await confirmar('¿Cargar ' + validas.length + ' ejercicios del archivo? Los existentes no se modificarán.', 'Importar ejercicios')) return;
        importando = true; confirmarCarga.disabled = true; archivo.disabled = true;
        let cargados = 0; const errores: string[] = [];
        try {
            for (const [indice, fila] of validas.entries()) {
                estado.textContent = 'Cargando ' + (indice + 1) + ' de ' + validas.length + '…';
                try { await api('/api/ejercicios', { codigo: fila.codigo, nombre: fila.nombre, grupoMuscular: fila.grupoMuscular, descripcion: fila.descripcion }); cargados++; fila.error = 'Ya importada'; }
                catch (error) { errores.push('Fila ' + fila.fila + ': ' + (error instanceof Error ? error.message : 'Error de carga')); }
            }
            await cargar();
            estado.textContent = cargados + ' ejercicios cargados. ' + errores.length + ' errores. ' + errores.join(' | ');
        } finally { importando = false; archivo.disabled = false; confirmarCarga.disabled = !filasExcel.some(f => !f.error); }
    })().catch(avisar));
    elemento('plantilla-excel').addEventListener('click', () => void (async () => {
        const { default: ExcelJS } = await import('exceljs'); const libro = new ExcelJS.Workbook(); const hoja = libro.addWorksheet('Ejercicios');
        hoja.addRow(['código', 'nombre', 'grupo muscular', 'descripción']); hoja.addRow(['EJ-001', 'Sentadilla', 'Piernas', 'Mantener la espalda alineada']);
        const datos = await libro.xlsx.writeBuffer(); const url = URL.createObjectURL(new Blob([datos], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        const enlace = document.createElement('a'); enlace.href = url; enlace.download = 'plantilla-ejercicios.xlsx'; enlace.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    })().catch(avisar));
}
