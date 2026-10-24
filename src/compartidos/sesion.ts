// Roles admitidos por el sistema.
export type RolUsuario = 'ADMIN' | 'ENTRENADOR' | 'USUARIO'

// Datos básicos que devuelve el backend.
// No incluye contraseñas, hashes ni tokens.
export interface UsuarioSesion {
  id: string
  nombre: string
  apellido: string
  email: string
  rol: RolUsuario
  clienteId: string | null
}

const rutaLogin = '/src/auth/login/login.html'

// Comprobamos el formato de los datos recibidos.
// Declarar una interfaz no valida automáticamente una respuesta de Internet.
function esUsuarioSesion(valor: unknown): valor is UsuarioSesion {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) {
    return false
  }

  const usuario = valor as Record<string, unknown>

  const rolValido =
    usuario.rol === 'ADMIN' ||
    usuario.rol === 'ENTRENADOR' ||
    usuario.rol === 'USUARIO'

  return (
    typeof usuario.id === 'string' &&
    typeof usuario.nombre === 'string' &&
    typeof usuario.apellido === 'string' &&
    typeof usuario.email === 'string' &&
    rolValido &&
    (
      usuario.clienteId === null ||
      typeof usuario.clienteId === 'string'
    )
  )
}

// 1. Consultamos quién tiene una sesión activa.
// Devuelve null si no hay sesión; lanza un error si falla la consulta.
export async function obtenerSesion(): Promise<UsuarioSesion | null> {
  const respuesta = await fetch('/api/usuarios/sesion', {
    method: 'GET',
    credentials: 'include',
    cache: 'no-store',
  })

  if (respuesta.status === 401) {
    return null
  }

  if (!respuesta.ok) {
    throw new Error('No pudimos comprobar tu sesión. Intentá nuevamente.')
  }

  const resultado: unknown = await respuesta.json()

  if (
    !resultado ||
    typeof resultado !== 'object' ||
    !('usuario' in resultado) ||
    !esUsuarioSesion(resultado.usuario)
  ) {
    throw new Error('Los datos de la sesión no tienen el formato esperado.')
  }

  return resultado.usuario
}

// 2. Para las páginas que requieren iniciar sesión.
// Si no hay sesión, enviamos al usuario al login.
export async function exigirSesion(): Promise<UsuarioSesion | null> {
  const usuario = await obtenerSesion()

  if (!usuario) {
    window.location.replace(rutaLogin)
    return null
  }

  return usuario
}

// 3. Cerramos la sesión real del servidor.
// Solo redirigimos cuando el backend confirma que pudo cerrarla.
export async function cerrarSesion(): Promise<void> {
  const respuesta = await fetch('/api/usuarios/logout', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })

  if (!respuesta.ok) {
    throw new Error('No pudimos cerrar la sesión. Intentá nuevamente.')
  }

  window.location.replace(rutaLogin)
}