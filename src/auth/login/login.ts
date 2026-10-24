import { obtenerSesion, redirigirSegunRol } from '../../compartidos/sesion.ts'
// 1. Obtenemos los elementos del HTML.
const formulario = document.querySelector<HTMLFormElement>(
  '#formulario-login'
)

const mensaje = document.querySelector<HTMLParagraphElement>(
  '#mensaje-login'
)

const campoCorreo = document.querySelector<HTMLInputElement>('#correo')
const campoContrasena = document.querySelector<HTMLInputElement>('#contrasena')

if (!formulario || !mensaje || !campoCorreo || !campoContrasena) {
  throw new Error('No se encontraron los elementos del login.')
}

const campos = [campoCorreo, campoContrasena]
const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

let enviando = false
let validacionIniciada = false
let credencialesIncorrectas = false

// 2. Marcamos un campo y lo asociamos con el mensaje de error.
function marcarCampo(campo: HTMLInputElement): void {
  campo.setAttribute('aria-invalid', 'true')
  campo.setAttribute('aria-describedby', 'mensaje-login')
}

// Quitamos las marcas de la comprobación anterior.
function limpiarMarcas(): void {
  for (const campo of campos) {
    campo.removeAttribute('aria-invalid')
    campo.removeAttribute('aria-describedby')
  }
}

// 3. Validamos los datos antes de enviarlos.
function validarFormulario(enfocar: boolean): boolean {
  limpiarMarcas()

  const errores: string[] = []
  let primerCampoIncorrecto: HTMLInputElement | undefined

  // Marcamos todos los campos vacíos con un único mensaje.
  for (const campo of campos) {
    if (!campo.value.trim()) {
      marcarCampo(campo)
      primerCampoIncorrecto ??= campo
    }
  }

  if (primerCampoIncorrecto) {
    errores.push('Completá los campos marcados.')
  }

  const correo = campoCorreo!.value.trim()

  // Solo comprobamos el formato si se ingresó un correo.
  if (
    correo &&
    (correo.length > 254 || !formatoCorreo.test(correo))
  ) {
    marcarCampo(campoCorreo!)
    primerCampoIncorrecto ??= campoCorreo!
    errores.push('Ingresá un correo válido, por ejemplo: nombre@correo.com.')
  }

  // El servidor no indica cuál de las dos credenciales es incorrecta.
  if (credencialesIncorrectas) {
    marcarCampo(campoCorreo!)
    marcarCampo(campoContrasena!)
    primerCampoIncorrecto ??= campoCorreo!
    errores.push('Correo o contraseña incorrectos.')
  }

  mensaje!.dataset.estado = 'error'
  mensaje!.textContent = errores.join(' ')

  if (enfocar) primerCampoIncorrecto?.focus()

  return errores.length === 0
}

// 4. Actualizamos las marcas mientras se corrigen los datos.
formulario.addEventListener('input', () => {
  if (enviando) return

  // Al editar, permitimos comprobar nuevamente las credenciales.
  credencialesIncorrectas = false

  if (validacionIniciada) {
    validarFormulario(false)
  }
})

// 5. Enviamos el intento de inicio de sesión al backend.
formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  if (enviando) return

  validacionIniciada = true
  if (!validarFormulario(true)) return

  const boton = formulario.querySelector<HTMLButtonElement>(
    'button[type="submit"]'
  )

  const textoOriginalBoton = boton?.textContent ?? 'Ingresar'

  enviando = true

  if (boton) {
    boton.disabled = true
    boton.textContent = 'Ingresando…'
  }

  // Conservamos los datos enviados mientras esperamos la respuesta.
  for (const campo of campos) campo.readOnly = true

  formulario.setAttribute('aria-busy', 'true')
  mensaje.textContent = ''

  try {
    const respuesta = await fetch('/api/usuarios/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },

      // Permite recibir y enviar la cookie de sesión del backend.
      credentials: 'include',

      body: JSON.stringify({
        email: campoCorreo.value.trim().toLowerCase(),

        // No recortamos ni modificamos la contraseña.
        contrasena: campoContrasena.value,
      }),
    })

    const resultado: unknown = await respuesta.json()

    // Comprobamos el formato de la respuesta antes de utilizarla.
    if (
      resultado === null ||
      typeof resultado !== 'object' ||
      !('mensaje' in resultado) ||
      typeof resultado.mensaje !== 'string'
    ) {
      mensaje.textContent = 'El servidor devolvió una respuesta inesperada.'
      return
    }

    // 401 significa que el servidor rechazó las credenciales.
    if (respuesta.status === 401) {
      credencialesIncorrectas = true
      validarFormulario(true)
      return
    }

    // Otros errores, como una indisponibilidad temporal del servidor.
    if (!respuesta.ok) {
      mensaje.textContent = resultado.mensaje
      return
    }

    // 6. Mostramos éxito solo cuando lo confirma el backend.
    limpiarMarcas()
    validacionIniciada = false
    credencialesIncorrectas = false

    mensaje.dataset.estado = 'exito'
    mensaje.textContent = resultado.mensaje

    // Quitamos la contraseña de la pantalla después de ingresar.
    campoContrasena.value = ''

    // Consultamos la sesión para conocer el rol real.
    const usuario = await obtenerSesion()

    if (!usuario) {
    mensaje.dataset.estado = 'error'
    mensaje.textContent = 'No pudimos confirmar tu sesión. Intentá nuevamente.'
    return
    }

    redirigirSegunRol(usuario)
  } catch {
    mensaje.dataset.estado = 'error'
    mensaje.textContent =
      'No pudimos completar el inicio de sesión. Intentá nuevamente.'
  } finally {
    // Restauramos el formulario tanto si hubo éxito como si hubo error.
    enviando = false
    formulario.removeAttribute('aria-busy')

    for (const campo of campos) campo.readOnly = false

    if (boton) {
      boton.disabled = false
      boton.textContent = textoOriginalBoton
    }
  }
})