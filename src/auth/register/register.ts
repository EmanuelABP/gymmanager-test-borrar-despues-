// Obtenemos el formulario del HTML.
const formulario = document.querySelector<HTMLFormElement>(
  '#formulario-registro'
)

if (!formulario) {
  throw new Error('No se encontró el formulario de registro.')
}

// Escuchamos el envío del formulario.
formulario.addEventListener('submit', (evento) => {
  // Evita que el navegador envíe el formulario y recargue la página.
  evento.preventDefault()

  // Acá agregaremos las validaciones y el envío al backend.
})