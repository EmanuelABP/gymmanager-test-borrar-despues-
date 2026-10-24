// 1. Obtenemos los elementos del HTML.
const formulario = document.querySelector<HTMLFormElement>(
  '#formulario-registro'
)

const mensaje = document.querySelector<HTMLParagraphElement>(
  '#mensaje-registro'
)

// Si falta algún elemento, detenemos la ejecución.
if (!formulario || !mensaje) {
  throw new Error('No se encontraron los elementos del registro.')
}

// 2. Definimos las reglas que vamos a utilizar.
const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const longitudMinimaContrasena = 8

// 3. Escuchamos el envío, tanto por el botón como por la tecla Enter.
formulario.addEventListener('submit', (evento) => {
  // Evitamos el envío automático y la recarga de la página.
  evento.preventDefault()

  // Borramos el mensaje de la validación anterior.
  mensaje.textContent = ''

  // 4. Leemos los valores mediante los atributos "name" del HTML.
  const datos = new FormData(formulario)

  const nombre = String(datos.get('nombre') ?? '').trim()
  const apellido = String(datos.get('apellido') ?? '').trim()
  const correo = String(datos.get('correo') ?? '').trim()

  // Conservamos las contraseñas exactamente como se escribieron.
  const contrasena = String(datos.get('contrasena') ?? '')
  const confirmacion = String(
    datos.get('confirmacionContrasena') ?? ''
  )

  // 5. Validamos los datos personales.
  // Cada return detiene este intento de registro.
  if (!nombre) {
    mensaje.textContent = 'Ingresá tu nombre.'
    return
  }

  if (!apellido) {
    mensaje.textContent = 'Ingresá tu apellido.'
    return
  }

  if (!correo) {
    mensaje.textContent = 'Ingresá tu correo electrónico.'
    return
  }

  if (!formatoCorreo.test(correo)) {
    mensaje.textContent =
      'Ingresá un correo válido, por ejemplo: nombre@correo.com.'
    return
  }

  // 6. Validamos la contraseña.
  // trim() solo comprueba que no esté formada únicamente por espacios.
  if (!contrasena.trim()) {
    mensaje.textContent = 'Ingresá una contraseña.'
    return
  }

  if (contrasena.length < longitudMinimaContrasena) {
    mensaje.textContent =
      `La contraseña debe tener al menos ${longitudMinimaContrasena} caracteres.`
    return
  }

  if (!confirmacion.trim()) {
    mensaje.textContent = 'Repetí tu contraseña para confirmarla.'
    return
  }

  if (contrasena !== confirmacion) {
    mensaje.textContent = 'Las contraseñas no coinciden.'
    return
  }

  // 7. Si llegamos acá, las validaciones anteriores pasaron.
  // El envío al backend se agregará en el siguiente paso.
  // La confirmación de contraseña no se enviará ni se guardará.
})