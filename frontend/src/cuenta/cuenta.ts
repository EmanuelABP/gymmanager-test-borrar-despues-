import { prepararPanel } from '../panel/estructura.ts';
import { api, elemento, manejarFormulario, nodo, ErrorAPI, avisar } from '../compartidos/api.ts';
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Mi cuenta', ['ADMIN', 'ENTRENADOR', 'USUARIO']);
    if (!usuario)
        return;
    elemento('datos-cuenta').append(nodo('p', usuario.nombre + ' ' + usuario.apellido), nodo('p', usuario.email), nodo('p', 'Rol: ' + usuario.rol));
    manejarFormulario('formulario-contrasena', async (datos) => {
        if (datos.contrasena !== datos.confirmacion)
            throw new ErrorAPI('Las contraseñas nuevas no coinciden.', ['contrasena', 'confirmacion']);
        const r = await api('/api/cuenta/contrasena', datos);
        elemento<HTMLFormElement>('formulario-contrasena').reset();
        return r.mensaje;
    });
}
void iniciar().catch(avisar);
