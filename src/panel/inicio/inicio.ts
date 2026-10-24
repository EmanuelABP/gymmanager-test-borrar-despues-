import {
  exigirSesion,
  cerrarSesion,
  redirigirSegunRol,
} from '../../compartidos/sesion.ts'

// 1. Obtenemos los elementos de la pantalla.
const mensaje = document.querySelector<HTMLParagraphElement>('#mensaje-panel')
const nombre = document.querySelector<HTMLSpanElement>('#nombre-personal')
const rol = document.querySelector<HTMLSpanElement>('#rol-personal')

const resumenAdministrador = document.querySelector<HTMLElement>(
  '#resumen-administrador'
)

const resumenEntrenador = document.querySelector<HTMLElement>(
  '#resumen-entrenador'
)

const botonCerrar = document.querySelector<HTMLButtonElement>(
  '#boton-cerrar-sesion'
)

const opcionesAdministrador = document.querySelectorAll<HTMLElement>(
  '[data-solo-admin]'
)

if (
  !mensaje ||
  !nombre ||
  !rol ||
  !resumenAdministrador ||
  !resumenEntrenador ||
  !botonCerrar
) {
  throw new Error('No se encontraron los elementos del panel.')
}

// 2. Esperamos la comprobación antes de mostrar las secciones.
resumenAdministrador.hidden = true
resumenEntrenador.hidden = true
botonCerrar.disabled = true
mensaje.textContent = 'Comprobando tu sesión…'

for (const opcion of opcionesAdministrador) {
  opcion.hidden = true
}

async function iniciarPanel(): Promise<void> {
  try {
    const usuario = await exigirSesion()

    // exigirSesion redirige al login cuando no hay sesión.
    if (!usuario) return

    // Los clientes tienen su propia pantalla.
    if (usuario.rol === 'USUARIO') {
      redirigirSegunRol(usuario)
      return
    }

    // 3. Mostramos los datos del personal autenticado.
    nombre!.textContent = `${usuario.nombre} ${usuario.apellido}`

    const esAdministrador = usuario.rol === 'ADMIN'

    rol!.textContent = esAdministrador
      ? 'Administrador'
      : 'Entrenador'

    // 4. Adaptamos la pantalla al rol.
    resumenAdministrador!.hidden = !esAdministrador
    resumenEntrenador!.hidden = esAdministrador

    for (const opcion of opcionesAdministrador) {
      opcion.hidden = !esAdministrador
    }

    botonCerrar!.disabled = false
    mensaje!.textContent = ''

    // Los indicadores conservarán "—" hasta consultar datos reales.
    // Los módulos del menú se habilitarán cuando estén implementados.
  } catch {
    mensaje!.textContent =
      'No pudimos cargar el panel. Recargá la página para intentar nuevamente.'
  }
}

// 5. Cerramos la sesión desde el botón del panel.
botonCerrar.addEventListener('click', async () => {
  botonCerrar.disabled = true

  try {
    await cerrarSesion()
  } catch {
    mensaje.textContent =
      'No pudimos cerrar la sesión. Intentá nuevamente.'

    botonCerrar.disabled = false
  }
})

void iniciarPanel()