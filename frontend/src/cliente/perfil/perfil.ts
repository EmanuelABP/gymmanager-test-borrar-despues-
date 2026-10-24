import { prepararPanel } from '../../panel/estructura.ts';
import { api, elemento, nodo, enlace, avisar, fecha } from '../../compartidos/api.ts';
import { dibujarRutina } from '../../compartidos/rutinas.ts';
import { prepararImpresionRutina } from '../../compartidos/impresion-rutina.ts';
import type { Ficha, Turno } from '../../compartidos/modelos.ts';
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Mi perfil', ['USUARIO']);
    if (!usuario)
        return;
    elemento('nombre-cliente').textContent = usuario.nombre + ' ' + usuario.apellido;
    elemento('correo-cliente').textContent = usuario.email;
    const { cliente, turnos } = await api<{
        cliente: Ficha | null;
        turnos: Turno[];
    }>('/api/perfil');
    if (!cliente) {
        elemento('estado-ficha').textContent = 'Tu cuenta todavía no está vinculada a una ficha. Consultá con administración para completar la vinculación.';
        dibujarRutina(elemento('rutina'));
        elemento('turnos').append(nodo('p', 'Todavía no tenés turnos asignados.', 'estado-vacio'));
        elemento('acceso-historia').append(nodo('p', 'Disponible cuando administración vincule tu ficha.', 'ayuda'));
        return;
    }
    elemento('nombre-cliente').textContent = cliente.nombre + ' ' + cliente.apellido;
    elemento('estado-ficha').textContent = cliente.activo ? 'Cliente desde ' + fecha(cliente.fechaCreacion) : 'Tu ficha está inactiva. Podés consultar tu información; contactá con administración para reactivarla.';
    const vigente = cliente.rutinas.find(r => r.activo);
    dibujarRutina(elemento('rutina'), vigente);
    prepararImpresionRutina(cliente, vigente);
    elemento('imprimir').hidden = !vigente;
    elemento('imprimir').addEventListener('click', () => window.print());
    const lista = elemento('turnos');
    if (!turnos.length)
        lista.append(nodo('p', 'Todavía no tenés turnos asignados.', 'estado-vacio'));
    for (const turno of turnos) {
        const item = nodo('article', '', 'item-detalle');
        item.append(nodo('h3', turno.dia), nodo('p', turno.horaInicio + ' a ' + turno.horaFin), nodo('p', 'Entrenador: ' + turno.entrenador));
        lista.append(item);
    }
    elemento('acceso-historia').append(enlace(cliente.activo ? 'Ver / editar mi historia' : 'Consultar mi historia', '../historia/historia.html'));
}
void iniciar().catch(avisar);
