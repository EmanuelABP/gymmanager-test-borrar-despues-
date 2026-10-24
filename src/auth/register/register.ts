// 1. Obtenemos los elementos del HTML.
const formulario = document.querySelector<HTMLFormElement>('#formulario-registro')
const mensaje = document.querySelector<HTMLParagraphElement>('#mensaje-registro')

if (!formulario || !mensaje) {
  throw new Error('No se encontraron los elementos del registro.')
}

function obtenerCampo(id: string): HTMLInputElement {
  const campo = document.querySelector<HTMLInputElement>(`#${id}`)
  if (!campo) throw new Error(`No se encontró el campo ${id}.`)
  return campo
}

const campos = {
  nombre: obtenerCampo('nombre'),
  apellido: obtenerCampo('apellido'),
  correo: obtenerCampo('correo'),
  contrasena: obtenerCampo('contrasena'),
  confirmacion: obtenerCampo('confirmacion-contrasena'),
}

type NombreCampo = keyof typeof campos
const nombresCampos = Object.keys(campos) as NombreCampo[]
const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const longitudMinimaContrasena = 8

let enviando = false
let validacionIniciada = false
// Recordamos el correo rechazado por el servidor hasta que se cambie.
let correoDuplicado: string | undefined

// 2. Las reglas coinciden con las del backend.
function obtenerError(nombreCampo: NombreCampo): string | null {
  const valor = campos[nombreCampo].value

  if (!valor.trim()) return 'Completá los campos marcados.'

  switch (nombreCampo) {
    case 'nombre':
      return valor.trim().length > 100
        ? 'El nombre admite hasta 100 caracteres.' : null
    case 'apellido':
      return valor.trim().length > 100
        ? 'El apellido admite hasta 100 caracteres.' : null
    case 'correo': {
      const correo = valor.trim().toLowerCase()
      if (correo.length > 254 || !formatoCorreo.test(correo)) {
        return 'Ingresá un correo válido, por ejemplo: nombre@correo.com.'
      }
      return correo === correoDuplicado ? 'Ese correo ya está registrado.' : null
    }
    case 'contrasena':
      if (valor.length < longitudMinimaContrasena) {
        return `La contraseña debe tener al menos ${longitudMinimaContrasena} caracteres.`
      }
      // bcrypt admite hasta 72 bytes; algunos caracteres ocupan más de uno.
      if (new TextEncoder().encode(valor).length > 72) {
        return 'La contraseña es demasiado extensa: admite hasta 72 bytes.'
      }
      return null
    case 'confirmacion':
      return valor !== campos.contrasena.value
        ? 'Las contraseñas no coinciden.' : null
  }
}

// 3. Marcamos todos los campos incorrectos y enfocamos el primero al enviar.
// aria-invalid y aria-describedby permiten identificar el error con lectores de pantalla.
function validarFormulario(enfocar: boolean): boolean {
  const errores: string[] = []
  let primerCampoIncorrecto: HTMLInputElement | undefined

  for (const nombreCampo of nombresCampos) {
    const campo = campos[nombreCampo]
    const error = obtenerError(nombreCampo)

    if (error) {
      campo.setAttribute('aria-invalid', 'true')
      campo.setAttribute('aria-describedby', 'mensaje-registro')
      errores.push(error)
      primerCampoIncorrecto ??= campo
    } else {
      campo.removeAttribute('aria-invalid')
      campo.removeAttribute('aria-describedby')
    }
  }

  // Si hay varios campos vacíos, el mensaje se muestra una sola vez.
  mensaje!.dataset.estado = 'error'
  mensaje!.textContent = [...new Set(errores)].join(' ')

  if (enfocar) primerCampoIncorrecto?.focus()
  return errores.length === 0
}

// Revalidamos mientras se corrige el formulario, después del primer intento.
// También se vuelve a comprobar la confirmación si cambia la contraseña.
formulario.addEventListener('input', () => {
  if (validacionIniciada && !enviando) validarFormulario(false)
})

// 4. Enviamos únicamente si los datos son válidos.
formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault()
  if (enviando) return

  validacionIniciada = true
  if (!validarFormulario(true)) return

  const boton = formulario.querySelector<HTMLButtonElement>('button[type="submit"]')
  const correoEnviado = campos.correo.value.trim().toLowerCase()

  enviando = true
  if (boton) boton.disabled = true
  // Evitamos que cambien los datos mientras esperamos la respuesta de este envío.
  for (const nombreCampo of nombresCampos) campos[nombreCampo].readOnly = true

  try {
    const respuesta = await fetch('/api/usuarios/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre: campos.nombre.value.trim(),
        apellido: campos.apellido.value.trim(),
        email: correoEnviado,
        contrasena: campos.contrasena.value,
      }),
    })

    const resultado: unknown = await respuesta.json()
    const textoRespuesta =
      resultado !== null &&
      typeof resultado === 'object' &&
      'mensaje' in resultado &&
      typeof resultado.mensaje === 'string'
        ? resultado.mensaje
        : 'No pudimos completar el registro.'

    if (!respuesta.ok) {
      // Esta ruta devuelve 409 cuando ya existe el correo.
      if (respuesta.status === 409) {
        correoDuplicado = correoEnviado
        validarFormulario(true)
      } else {
        // Un problema general del servidor no se atribuye a un campo concreto.
        mensaje.dataset.estado = 'error'
        mensaje.textContent = textoRespuesta
      }
      return
    }

    // 5. Limpiamos el formulario solamente cuando el backend confirma la creación.
    formulario.reset()
    correoDuplicado = undefined
    validacionIniciada = false
    mensaje.dataset.estado = 'exito'
    mensaje.textContent = textoRespuesta
  } catch {
    mensaje.dataset.estado = 'error'
    mensaje.textContent = 'No pudimos comunicarnos con el servidor. Intentá nuevamente.'
  } finally {
    enviando = false
    if (boton) boton.disabled = false
    for (const nombreCampo of nombresCampos) campos[nombreCampo].readOnly = false
  }
})
