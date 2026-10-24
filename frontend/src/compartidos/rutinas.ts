import { nodo, tabla, fecha } from './api.ts';
import type { Rutina } from './modelos.ts';
export function dibujarRutina(contenedor: HTMLElement, rutina?: Rutina): void {
    contenedor.replaceChildren();
    if (!rutina) {
        contenedor.append(nodo('p', 'Todavía no hay una rutina vigente.', 'estado-vacio'));
        return;
    }
    contenedor.append(nodo('p', 'Asignada el ' + fecha(rutina.fechaAsignacion), 'ayuda'));
    if (rutina.observaciones)
        contenedor.append(nodo('p', rutina.observaciones));
    const detalle = nodo('div');
    contenedor.append(detalle);
    tabla(detalle, ['Ejercicio', 'Series', 'Repeticiones', 'Peso (kg)', 'Descanso (s)', 'Indicaciones'], [...rutina.ejercicios].sort((a, b) => a.orden - b.orden).map(e => [e.nombre, String(e.series ?? '—'), String(e.repeticiones ?? '—'), String(e.peso ?? '—'), String(e.descanso ?? '—'), e.observaciones || '—']));
}
