import './impresion-rutina.css';
import { nodo, fecha } from './interfaz.ts';
import type { Ficha, Rutina } from '../tipos/entidades.ts';

// La misma hoja para los tres roles. No imprime la pantalla ni datos clínicos.
// También se aplica con Ctrl+P, una vez cargada la rutina vigente.
export function prepararImpresionRutina(cliente?: Pick<Ficha, 'nombre' | 'apellido'>, rutina?: Rutina): void {
    document.getElementById('documento-rutina')?.remove();
    document.body.classList.remove('con-rutina-para-imprimir');
    if (!cliente || !rutina) return;

    const documento = nodo('article', '', 'documento-rutina');
    documento.id = 'documento-rutina';
    const encabezado = nodo('header', '', 'impresion-encabezado');
    encabezado.append(nodo('h1', 'GymManager'), nodo('p', 'Rutina de entrenamiento'));
    const identidad = nodo('section', '', 'impresion-identidad');
    identidad.append(nodo('h2', `${cliente.nombre} ${cliente.apellido}`), nodo('p', 'Asignada el ' + fecha(rutina.fechaAsignacion)));
    documento.append(encabezado, identidad);

    if (rutina.observaciones) {
        const indicaciones = nodo('section', '', 'impresion-indicaciones');
        indicaciones.append(nodo('h3', 'Indicaciones generales'), nodo('p', rutina.observaciones));
        documento.append(indicaciones);
    }

    const tabla = nodo('table');
    tabla.setAttribute('aria-label', 'Ejercicios de la rutina vigente');
    const columnas = nodo('colgroup');
    for (const nombre of ['ejercicio', 'series', 'repeticiones', 'peso', 'descanso', 'indicaciones']) {
        const columna = nodo('col');
        columna.className = 'impresion-columna-' + nombre;
        columnas.append(columna);
    }
    const cabecera = nodo('thead'), titulos = nodo('tr');
    for (const texto of ['Ejercicio', 'Series', 'Repeticiones', 'Peso (kg)', 'Descanso (s)', 'Indicaciones']) {
        const celda = nodo('th', texto);
        celda.scope = 'col';
        titulos.append(celda);
    }
    cabecera.append(titulos);
    const cuerpo = nodo('tbody');
    [...rutina.ejercicios].sort((a, b) => a.orden - b.orden).forEach((ejercicio, indice) => {
        const fila = nodo('tr');
        const nombre = nodo('th', `${indice + 1}. ${ejercicio.nombre}`);
        nombre.scope = 'row';
        fila.append(nombre);
        for (const valor of [ejercicio.series, ejercicio.repeticiones, ejercicio.peso, ejercicio.descanso, ejercicio.observaciones || '—'])
            fila.append(nodo('td', String(valor ?? '—')));
        cuerpo.append(fila);
    });
    tabla.append(columnas, cabecera, cuerpo);
    documento.append(tabla);
    document.body.append(documento);
    document.body.classList.add('con-rutina-para-imprimir');
}
