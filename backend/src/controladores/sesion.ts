import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { ObjectId } from 'mongodb'
import { conectarDB } from '../db.ts'

// Leemos la cookie que creó el login.
function obtenerToken(solicitud: IncomingMessage): string | null {
  const cookie = solicitud.headers.cookie
    ?.split(';')
    .map(parte => parte.trim())
    .find(parte => parte.startsWith('gymmanager_sesion='))

  if (!cookie) return null

  const token = cookie.slice('gymmanager_sesion='.length)

  // El login genera un token hexadecimal de 64 caracteres.
  return /^[a-f0-9]{64}$/.test(token) ? token : null
}

// Generamos el mismo hash que guardó el login.
function generarHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// Borramos la cookie del navegador usando el mismo nombre y ruta.
function borrarCookie(respuesta: ServerResponse): void {
  const seguridadProduccion =
    process.env.NODE_ENV === 'production' ? '; Secure' : ''

  respuesta.setHeader(
    'Set-Cookie',
    `gymmanager_sesion=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${seguridadProduccion}`
  )
}

// Respuesta común para estas rutas.
function responder(
  respuesta: ServerResponse,
  estado: number,
  contenido: unknown
): void {
  respuesta.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  respuesta.end(JSON.stringify(contenido))
}

// Esta función también servirá para proteger futuras rutas del backend.
export async function obtenerUsuarioSesion(solicitud: IncomingMessage) {
  const token = obtenerToken(solicitud)
  if (!token) return null

  const db = await conectarDB()

  // Comprobamos el vencimiento explícitamente.
  // No dependemos de que MongoDB ya haya eliminado la sesión vencida.
  const sesion = await db.collection('sesiones').findOne({
    tokenHash: generarHash(token),
    fechaVencimiento: { $gt: new Date() },
  })

  if (!sesion || !(sesion.usuarioId instanceof ObjectId)) {
    return null
  }

  // Consultamos el estado y rol actuales del usuario.
  const usuario = await db.collection('usuarios').findOne(
    {
      _id: sesion.usuarioId,
      activo: true,
    },
    {
      projection: {
        nombre: 1,
        apellido: 1,
        email: 1,
        rol: 1,
        clienteId: 1,
      },
    }
  )

  if (
    !usuario ||
    !['ADMIN', 'ENTRENADOR', 'USUARIO'].includes(usuario.rol)
  ) {
    return null
  }

  // Devolvemos únicamente información que puede recibir el frontend.
  return {
    id: usuario._id.toHexString(),
    nombre: usuario.nombre,
    apellido: usuario.apellido,
    email: usuario.email,
    rol: usuario.rol,
    clienteId:
      usuario.clienteId instanceof ObjectId
        ? usuario.clienteId.toHexString()
        : null,
  }
}

// GET /api/usuarios/sesion
export async function consultarSesion(
  solicitud: IncomingMessage,
  respuesta: ServerResponse
): Promise<void> {
  try {
    const usuario = await obtenerUsuarioSesion(solicitud)

    if (!usuario) {
      borrarCookie(respuesta)

      responder(respuesta, 401, {
        mensaje: 'No tenés una sesión activa.',
      })
      return
    }

    responder(respuesta, 200, { usuario })
  } catch {
    responder(respuesta, 500, {
      mensaje: 'No pudimos comprobar tu sesión. Intentá nuevamente.',
    })
  }
}

// POST /api/usuarios/logout
export async function cerrarSesion(
  solicitud: IncomingMessage,
  respuesta: ServerResponse
): Promise<void> {
  try {
    // El frontend debe enviar esta solicitud como JSON.
    const tipoContenido = solicitud.headers['content-type']
      ?.split(';')[0]
      ?.trim()
      .toLowerCase()

    if (tipoContenido !== 'application/json') {
      responder(respuesta, 415, {
        mensaje: 'El formato de la solicitud no es válido.',
      })
      return
    }

    // No necesitamos utilizar el cuerpo de esta solicitud.
    solicitud.resume()

    const token = obtenerToken(solicitud)

    if (token) {
      const db = await conectarDB()

      // Cerramos solo la sesión de este navegador.
      await db.collection('sesiones').deleteOne({
        tokenHash: generarHash(token),
      })
    }

    borrarCookie(respuesta)

    responder(respuesta, 200, {
      mensaje: 'Cerraste sesión correctamente.',
    })
  } catch {
    responder(respuesta, 500, {
      mensaje: 'No pudimos cerrar la sesión. Intentá nuevamente.',
    })
  }
}