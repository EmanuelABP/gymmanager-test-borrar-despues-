import { prepararPanel } from '../../panel/estructura.ts';
import { api, elemento, manejarFormulario, enlace, avisar, fecha, ErrorAPI } from '../../compartidos/api.ts';
import type { Historia } from '../../compartidos/modelos.ts';
let clienteId = '';
let historia: Historia | null = null;
let soloLectura = false;
const formulario = elemento<HTMLFormElement>('formulario-historia');
function completar(): void {
    for (const campo of ['antecedentes', 'lesiones', 'observaciones'] as const)
        (formulario.elements.namedItem(campo) as HTMLTextAreaElement).value = historia?.[campo] ?? '';
}
async function cargar(): Promise<void> {
    const resultado = await api<{
        cliente: {
            nombre: string;
            apellido: string;
            activo: boolean;
        };
        historia: Historia | null;
    }>('/api/historia-clinica?clienteId=' + encodeURIComponent(clienteId));
    historia = resultado.historia;
    soloLectura = !resultado.cliente.activo;
    elemento('nombre-ficha').textContent = resultado.cliente.nombre + ' ' + resultado.cliente.apellido;
    elemento('fecha-actualizacion').textContent = historia ? 'Última actualización: ' + fecha(historia.fechaActualizacion) : 'Todavía no se cargó información clínica.';
    completar();
    for (const campo of formulario.querySelectorAll('textarea'))
        campo.readOnly = soloLectura;
    formulario.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.hidden = soloLectura; });
    if (soloLectura)
        elemento('fecha-actualizacion').textContent += ' · Ficha inactiva: solo consulta.';
}
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Historia clínica', ['ADMIN', 'ENTRENADOR', 'USUARIO']);
    if (!usuario)
        return;
    const solicitado = new URLSearchParams(location.search).get('clienteId');
    if (usuario.rol === 'USUARIO' && solicitado && solicitado !== usuario.clienteId) {
        location.replace('/src/cliente/perfil/perfil.html');
        return;
    }
    clienteId = usuario.rol === 'USUARIO' ? usuario.clienteId ?? '' : solicitado ?? '';
    if (!clienteId) {
        location.replace(usuario.rol === 'USUARIO' ? '/src/cliente/perfil/perfil.html' : '/src/panel/clientes/clientes.html');
        return;
    }
    elemento('acciones-historia').append(enlace('Volver', usuario.rol === 'USUARIO' ? '../perfil/perfil.html' : '/src/panel/clientes/clientes.html'));
    manejarFormulario('formulario-historia', async (datos) => {
        if (soloLectura)
            throw new ErrorAPI('La ficha está inactiva.');
        const r = await api('/api/historia-clinica', { ...datos, clienteId });
        await cargar();
        return r.mensaje;
    });
    elemento('cancelar-historia').addEventListener('click', completar);
    await cargar();
}
void iniciar().catch(avisar);
