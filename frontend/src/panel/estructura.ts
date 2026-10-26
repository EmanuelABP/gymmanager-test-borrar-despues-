import { exigirSesion, cerrarSesion, redirigirSegunRol } from '../servicios/sesion.ts';
import type { RolUsuario, UsuarioSesion } from '../servicios/sesion.ts';
import { avisar, elemento, nodo } from '../componentes/interfaz.ts';
export async function prepararPanel(titulo: string, roles: RolUsuario[] = ['ADMIN', 'ENTRENADOR']): Promise<UsuarioSesion | null> {
    try {
        const usuario = await exigirSesion();
        if (!usuario)
            return null;
        if (!roles.includes(usuario.rol)) {
            redirigirSegunRol(usuario);
            return null;
        }
        const vista = elemento('vista');
        // Estructura fija compartida; los datos de usuario se insertan con textContent.
        const estructura = nodo('div', '', 'estructura-panel');
        estructura.innerHTML = `<aside class="barra-lateral"><a class="marca-panel" href="/src/panel/inicio/inicio.html">GymManager</a><p class="submarca">Tu gimnasio, organizado.</p><nav class="menu-panel" aria-label="Menú principal"></nav><button class="boton-cerrar-sesion" type="button">Cerrar sesión</button></aside><div class="zona-principal"><header class="encabezado-panel"><div><p class="sobre-titulo">ESPACIO DE TRABAJO</p><h1></h1></div><div class="cuenta-panel"><span id="nombre-personal"></span><span id="rol-personal" class="etiqueta-rol"></span></div></header><main class="contenido-panel"><p id="mensaje-global" role="status"></p></main></div>`;
        estructura.querySelector('h1')!.textContent = titulo;
        estructura.querySelector('#nombre-personal')!.textContent = `${usuario.nombre} ${usuario.apellido}`;
        estructura.querySelector('#rol-personal')!.textContent = usuario.rol + (usuario.rol === 'ADMIN' && usuario.esEntrenador ? ' · ENTRENADOR' : '');
        const menu = estructura.querySelector('nav')!;
        const rutas: [
            string,
            string,
            RolUsuario[]
        ][] = [
            ['Inicio', '/src/panel/inicio/inicio.html', ['ADMIN', 'ENTRENADOR']],
            ['Clientes', '/src/panel/clientes/clientes.html', ['ADMIN', 'ENTRENADOR']],
            ['Ejercicios', '/src/panel/ejercicios/ejercicios.html', ['ADMIN', 'ENTRENADOR']],
            ['Rutinas', '/src/panel/rutinas/rutinas.html', ['ADMIN', 'ENTRENADOR']],
            ['Turnos', '/src/panel/turnos/turnos.html', ['ADMIN', 'ENTRENADOR']],
            ['Pagos', '/src/panel/pagos/pagos.html', ['ADMIN']],
            ['Cuentas', '/src/panel/cuentas/cuentas.html', ['ADMIN']],
            ['Mi perfil', '/src/cliente/perfil/perfil.html', ['USUARIO']],
            ['Mi cuenta', '/src/cuenta/cuenta.html', ['ADMIN', 'ENTRENADOR', 'USUARIO']],
        ];
        for (const [texto, destino, permitidos] of rutas) {
            if (!permitidos.includes(usuario.rol))
                continue;
            const enlace = nodo('a', texto, 'opcion-menu');
            enlace.href = destino;
            if (window.location.pathname === destino)
                enlace.setAttribute('aria-current', 'page');
            menu.append(enlace);
        }
        estructura.querySelector('button')!.addEventListener('click', async (evento) => {
            const boton = evento.currentTarget as HTMLButtonElement;
            boton.disabled = true;
            try {
                await cerrarSesion();
            }
            catch (error) {
                avisar(error);
                boton.disabled = false;
            }
        });
        document.body.replaceChildren(estructura);
        estructura.querySelector('main')!.append(vista);
        vista.hidden = false;
        return usuario;
    }
    catch {
        const aviso = nodo('p', 'No pudimos comprobar tu sesión. Verificá que el backend esté iniciado y recargá la página.', 'aviso-carga');
        document.body.prepend(aviso);
        return null;
    }
}
// Al volver con Atrás se vuelve a comprobar la sesión y los permisos.
window.addEventListener('pageshow', evento => { if (evento.persisted)
    window.location.reload(); });
