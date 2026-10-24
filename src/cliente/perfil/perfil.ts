import {
  exigirSesion,
  cerrarSesion,
} from '../../compartidos/sesion.ts'

// Obtenemos los elementos de la página.
const mensaje = document.querySelector<HTMLParagraphElement>(
  '#mensaje-perfil'
)

const presentacion = document.querySelector<HTMLElement>(
  '.presentacion-cliente'
)

const contenido = document.querySelector<HTMLDivElement>(
  '.contenido-perfil'
)

const botonCerrar = document.querySelector<HTMLButtonElement>(
  '#boton-cerrar-sesion'
)

if (!mensaje || !presentacion || !contenido || !botonCerrar) {
  throw new Error('No se encontraron los elementos del perfil.')
}

// Esperamos la comprobación antes de mostrar el contenido.
presentacion.hidden = true
contenido.hidden = true
mensaje.textContent = 'Comprobando tu sesión…'

async function iniciarPerfil(): Promise<void> {
  try {
    const usuario = await exigirSesion()

    // Si no hay sesión, exigirSesion ya redirige al login.
    if (!usuario) return

    // Permitimos cerrar sesión incluso si entró otro rol.
    botonCerrar!.disabled = false

    if (usuario.rol !== 'USUARIO') {
      mensaje!.textContent = 'Esta página está disponible para clientes.'
      return
    }

    const nombre = document.querySelector<HTMLElement>('#nombre-cliente')
    const correo = document.querySelector<HTMLElement>('#correo-cliente')
    const iniciales = document.querySelector<HTMLElement>('#iniciales-cliente')
    const aviso = document.querySelector<HTMLElement>('#aviso-vinculacion')

    // Usamos textContent para mostrar los datos como texto.
    if (nombre) {
      nombre.textContent = `${usuario.nombre} ${usuario.apellido}`
    }

    if (correo) correo.textContent = usuario.email

    if (iniciales) {
      iniciales.textContent =
        `${usuario.nombre.charAt(0)}${usuario.apellido.charAt(0)}`
          .toUpperCase()
    }

    if (aviso) aviso.hidden = usuario.clienteId !== null

    mensaje!.textContent = ''
    presentacion!.hidden = false
    contenido!.hidden = false
  } catch {
    mensaje!.textContent =
      'No pudimos cargar tu perfil. Recargá la página para intentar nuevamente.'
  }
}

// Cerramos la sesión únicamente cuando se pulsa el botón.
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

void iniciarPerfil()