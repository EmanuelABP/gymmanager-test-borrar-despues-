import type { IncomingMessage, ServerResponse } from 'node:http'
import { createHash, randomBytes } from 'node:crypto'
import { compare, hash } from 'bcryptjs'
import { conectarDB } from '../db.ts'

// Duración inicial de la sesión: ocho horas.
const duracionSesionSegundos = 8 * 60 * 60

// Permite hacer una comparación incluso cuando el correo no existe.
// Así evitamos responder inmediatamente solo en ese caso.
const hashDeRespaldo = hash(randomBytes(32).toString('hex'), 12)

// Envía una respuesta JSON al frontend.
function responder(
  respuesta: ServerResponse,
  estado: number,
  mensaje: string
): void {
  respuesta.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })

  respuesta.end(JSON.stringify({ mensaje }))
}

export async function iniciarSesion(
  solicitud: IncomingMessage,
  respuesta: ServerResponse
): Promise<void> {
  try {
    // 1. Aceptamos únicamente JSON.
    const tipoContenido = solicitud.headers['content-type']
      ?.split(';')[0]
      ?.trim()
      .toLowerCase()

    if (tipoContenido !== 'application/json') {
      responder(respuesta, 415, 'El formato de los datos no es válido.')
      return
    }

    // 2. Leemos el cuerpo, con un límite de 16 KB.
    let cuerpo = ''
    let demasiadoGrande = false

    solicitud.setEncoding('utf8')

    for await (const fragmento of solicitud) {
      if (demasiadoGrande) continue

      cuerpo += fragmento

      if (Buffer.byteLength(cuerpo, 'utf8') > 16_384) {
        demasiadoGrande = true
        cuerpo = ''
      }
    }

    if (demasiadoGrande) {
      responder(respuesta, 413, 'Los datos enviados son demasiado extensos.')
      return
    }

    let datos: unknown

    try {
      datos = JSON.parse(cuerpo)
    } catch {
      responder(respuesta, 400, 'Los datos enviados no tienen un JSON válido.')
      return
    }

    if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
      responder(respuesta, 400, 'Los datos del login no son válidos.')
      return
    }

    const campos = datos as Record<string, unknown>

    // 3. Validamos nuevamente desde el servidor.
    if (
      typeof campos.email !== 'string' ||
      typeof campos.contrasena !== 'string'
    ) {
      responder(respuesta, 400, 'Completá el correo y la contraseña.')
      return
    }

    const email = campos.email.trim().toLowerCase()

    // La contraseña se compara exactamente como fue escrita.
    const contrasena = campos.contrasena

    if (!email || !contrasena.trim()) {
      responder(respuesta, 400, 'Completá el correo y la contraseña.')
      return
    }

    const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    if (email.length > 254 || !formatoCorreo.test(email)) {
      responder(respuesta, 400, 'Ingresá un correo electrónico válido.')
      return
    }

    // Evitamos que bcrypt ignore silenciosamente parte de la contraseña.
    if (Buffer.byteLength(contrasena, 'utf8') > 72) {
      responder(respuesta, 400, 'La contraseña es demasiado extensa.')
      return
    }

    // 4. Buscamos la cuenta y comparamos su hash.
    const db = await conectarDB()
    const usuario = await db.collection('usuarios').findOne({ email })

    const hashGuardado =
      typeof usuario?.passwordHash === 'string'
        ? usuario.passwordHash
        : await hashDeRespaldo

    const contrasenaCorrecta = await compare(contrasena, hashGuardado)

    // Usamos el mismo mensaje para no revelar si existe una cuenta
    // o si está desactivada.
    if (!usuario || usuario.activo !== true || !contrasenaCorrecta) {
      responder(respuesta, 401, 'Correo o contraseña incorrectos.')
      return
    }

    // 5. Preparamos la colección de sesiones.
    const sesiones = db.collection('sesiones')

    // MongoDB reutiliza estos índices cuando ya existen.
    await sesiones.createIndex(
      { tokenHash: 1 },
      { unique: true }
    )

    await sesiones.createIndex(
      { fechaVencimiento: 1 },
      { expireAfterSeconds: 0 }
    )

    // 6. Generamos un identificador aleatorio para la sesión.
    const token = randomBytes(32).toString('hex')

    // En MongoDB guardamos su hash, no el token que recibe el navegador.
    const tokenHash = createHash('sha256')
      .update(token)
      .digest('hex')

    const fechaActual = new Date()
    const fechaVencimiento = new Date(
      fechaActual.getTime() + duracionSesionSegundos * 1000
    )

    await sesiones.insertOne({
      usuarioId: usuario._id,
      tokenHash,
      fechaCreacion: fechaActual,
      fechaVencimiento,
    })

    // 7. Enviamos la cookie de sesión.
    // En producción se enviará únicamente mediante HTTPS.
    const seguridadProduccion =
      process.env.NODE_ENV === 'production' ? '; Secure' : ''

    respuesta.setHeader(
      'Set-Cookie',
      `gymmanager_sesion=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${duracionSesionSegundos}${seguridadProduccion}`
    )

    // Nunca devolvemos el hash de contraseña ni el token en el JSON.
    responder(respuesta, 200, 'Iniciaste sesión correctamente.')
  } catch {
    // No exponemos errores internos ni datos privados.
    responder(
      respuesta,
      500,
      'No pudimos iniciar sesión. Intentá nuevamente.'
    )
  }
}