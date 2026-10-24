import { obtenerSesion, redirigirSegunRol } from '../compartidos/sesion.ts'

// Ocultamos el formulario hasta comprobar si corresponde abrir una sesión nueva.
export async function comprobarEntradaPublica(): Promise<void> {
  const formulario = document.querySelector<HTMLFormElement>('form')
  if (formulario) formulario.hidden = true
  try {
    const usuario = await obtenerSesion()
    if (usuario) { redirigirSegunRol(usuario); return }
    if (formulario) formulario.hidden = false
  } catch {
    const mensaje = document.querySelector<HTMLElement>('[role="status"]')
    if (mensaje) mensaje.textContent = 'No pudimos comprobar la sesión. Verificá que el backend esté iniciado y recargá la página.'
  }
}

window.addEventListener('pageshow', evento => { if (evento.persisted) window.location.reload() })
