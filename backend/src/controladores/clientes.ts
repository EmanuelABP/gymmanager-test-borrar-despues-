import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Db } from 'mongodb'
import { MongoServerError, ObjectId } from 'mongodb'
import { conectarDB, ejecutarTransaccion } from '../db.ts'
import { obtenerUsuarioSesion } from './sesion.ts'
import { fechaArgentina } from '../compartidos/http.ts'
import type { Turno } from '../compartidos/modelos.ts'
import { ErrorHTTP } from '../compartidos/http.ts'

// Error controlado que podemos mostrar al usuario.
class ErrorSolicitud extends Error {
  estado: number
  campos: string[]

  constructor(estado: number, mensaje: string, campos: string[] = []) {
    super(mensaje)
    this.estado = estado
    this.campos = campos
  }
}

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

// Lee únicamente objetos JSON y limita su tamaño.
async function leerDatos(
  solicitud: IncomingMessage
): Promise<Record<string, unknown>> {
  const tipo = solicitud.headers['content-type']
    ?.split(';')[0]
    ?.trim()
    .toLowerCase()

  if (tipo !== 'application/json') {
    throw new ErrorSolicitud(415, 'El formato de los datos no es válido.')
  }

  solicitud.setEncoding('utf8')

  let cuerpo = ''
  let demasiadoGrande = false

  for await (const fragmento of solicitud) {
    if (demasiadoGrande) continue

    cuerpo += fragmento

    if (Buffer.byteLength(cuerpo, 'utf8') > 16_384) {
      demasiadoGrande = true
      cuerpo = ''
    }
  }

  if (demasiadoGrande) {
    throw new ErrorSolicitud(413, 'Los datos enviados son demasiado extensos.')
  }

  let datos: unknown

  try {
    datos = JSON.parse(cuerpo)
  } catch {
    throw new ErrorSolicitud(400, 'Los datos enviados no tienen un JSON válido.')
  }

  if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
    throw new ErrorSolicitud(400, 'Los datos enviados no son válidos.')
  }

  return datos as Record<string, unknown>
}

// Obtiene un texto, elimina espacios exteriores y comprueba su longitud.
function leerTexto(
  datos: Record<string, unknown>,
  campo: string,
  maximo: number,
  obligatorio = false
): string {
  const valor = datos[campo] ?? ''

  if (typeof valor !== 'string') {
    throw new ErrorSolicitud(400, 'Revisá los campos marcados.', [campo])
  }

  const texto = valor.trim()

  if (obligatorio && !texto) {
    throw new ErrorSolicitud(400, 'Completá los campos marcados.', [campo])
  }

  if (texto.length > maximo) {
    throw new ErrorSolicitud(
      400,
      `El campo ${campo} admite hasta ${maximo} caracteres.`,
      [campo]
    )
  }

  return texto
}

// Garantiza las restricciones previstas en el esquema del TP.
// No guardamos usuarioId: null en las fichas sin cuenta.
async function prepararIndices(db: Db): Promise<void> {
  await db.collection('clientes').createIndex(
    { dni: 1 },
    { unique: true }
  )

  await db.collection('clientes').createIndex(
    { usuarioId: 1 },
    { unique: true, sparse: true }
  )
}

export function crearGestorClientes(dependencias = {
  conectar: conectarDB, usuario: obtenerUsuarioSesion, transaccion: ejecutarTransaccion,
}) {
return async function gestionarClientes(
  solicitud: IncomingMessage,
  respuesta: ServerResponse
): Promise<void> {
  try {
    // 1. Comprobamos sesión y permisos en el servidor.
    const personal = await dependencias.usuario(solicitud)

    if (!personal) {
      throw new ErrorSolicitud(401, 'Iniciá sesión para continuar.')
    }

    if (personal.rol !== 'ADMIN' && personal.rol !== 'ENTRENADOR') {
      throw new ErrorSolicitud(403, 'No tenés permiso para acceder a clientes.')
    }

    const ruta = solicitud.url?.split('?')[0]
    const db = await dependencias.conectar()

    // 2. Listado disponible para administración y entrenadores.
    if (solicitud.method === 'GET' && ruta === '/api/clientes') {
      // Seleccionamos los campos necesarios. No exponemos historia clínica.
      const documentos = await db.collection('clientes')
        .find({}, {
          projection: {
            nombre: 1,
            apellido: 1,
            dni: 1,
            telefono: 1,
            email: 1,
            activo: 1,
            usuarioId: 1,
          },
        })
        .sort({ apellido: 1, nombre: 1, _id: 1 })
        .toArray()

      const clientes = documentos.map(cliente => ({
        id: cliente._id.toHexString(),
        nombre: cliente.nombre,
        apellido: cliente.apellido,
        dni: cliente.dni,
        telefono: cliente.telefono ?? '',
        email: cliente.email ?? '',
        activo: cliente.activo,
        vinculado: cliente.usuarioId instanceof ObjectId,
      }))

      responder(respuesta, 200, { clientes })
      return
    }

    if (solicitud.method !== 'POST') {
      throw new ErrorSolicitud(405, 'Método no permitido.')
    }

    // Solo administración puede crear y vincular fichas.
    if (personal.rol !== 'ADMIN') {
      throw new ErrorSolicitud(403, 'Esta acción requiere permisos de administrador.')
    }

    const datos = await leerDatos(solicitud)

    // 3. Alta de una ficha sin cuenta asociada.
    if (ruta === '/api/clientes' || ruta === '/api/clientes/editar') {
      const nombre = leerTexto(datos, 'nombre', 100, true)
      const apellido = leerTexto(datos, 'apellido', 100, true)

      const dni = leerTexto(datos, 'dni', 20, true)
        .replace(/[.\s-]/g, '')

      const telefono = leerTexto(datos, 'telefono', 30)
      const email = leerTexto(datos, 'email', 254).toLowerCase()
      const direccion = leerTexto(datos, 'direccion', 300)
      const nacimiento = leerTexto(datos, 'fechaNacimiento', 10)
      const fechaNacimiento = nacimiento ? fechaArgentina(nacimiento, 'fechaNacimiento') : undefined
      if (fechaNacimiento && fechaNacimiento > new Date()) {
        throw new ErrorSolicitud(400, 'La fecha de nacimiento no puede ser futura.', ['fechaNacimiento'])
      }
      const contactoEmergencia = {
        nombre: leerTexto(datos, 'emergenciaNombre', 100),
        telefono: leerTexto(datos, 'emergenciaTelefono', 30),
        relacion: leerTexto(datos, 'emergenciaRelacion', 100),
      }

      // Regla inicial para DNI argentino.
      if (!/^\d{7,8}$/.test(dni)) {
        throw new ErrorSolicitud(
          400,
          'Ingresá un DNI de siete u ocho dígitos.',
          ['dni']
        )
      }

      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new ErrorSolicitud(
          400,
          'Ingresá un correo de contacto válido.',
          ['email']
        )
      }

      await prepararIndices(db)

      const fechaActual = new Date()

      if (ruta === '/api/clientes/editar') {
        const clienteId = leerTexto(datos, 'clienteId', 24, true)
        if (!/^[a-f0-9]{24}$/i.test(clienteId)) throw new ErrorSolicitud(400, 'Seleccioná un cliente válido.')
        const resultado = await db.collection('clientes').updateOne(
          { _id: new ObjectId(clienteId) },
          {
            $set: { nombre, apellido, dni, telefono, email, direccion, contactoEmergencia, fechaModificacion: fechaActual, ...(fechaNacimiento ? { fechaNacimiento } : {}) },
            ...(!fechaNacimiento ? { $unset: { fechaNacimiento: '' } } : {}),
          }
        )
        if (!resultado.matchedCount) throw new ErrorSolicitud(404, 'El cliente no existe.')
        responder(respuesta, 200, { mensaje: 'Ficha actualizada correctamente.' })
        return
      }

      await db.collection('clientes').insertOne({
        nombre,
        apellido,
        dni,
        activo: true,
        fechaCreacion: fechaActual,
        fechaModificacion: fechaActual,
        rutinas: [],
        direccion,
        contactoEmergencia,
        ...(fechaNacimiento ? { fechaNacimiento } : {}),
        ...(telefono ? { telefono } : {}),
        ...(email ? { email } : {}),
      })

      responder(respuesta, 201, {
        mensaje: 'Cliente creado correctamente.',
      })
      return
    }

    if (ruta === '/api/clientes/desactivar' || ruta === '/api/clientes/reactivar') {
      const clienteId = leerTexto(datos, 'clienteId', 24, true)
      if (!/^[a-f0-9]{24}$/i.test(clienteId)) throw new ErrorSolicitud(400, 'Seleccioná un cliente válido.')
      const id = new ObjectId(clienteId)
      const activo = ruta.endsWith('/reactivar')
      await dependencias.transaccion(async (base, transaccion) => {
        const ahora = new Date()
        const cambio = await base.collection('clientes').updateOne({ _id: id, activo: !activo }, activo
          ? { $set: { activo: true, fechaModificacion: ahora, inicioCicloCuotas: ahora, cicloCuotasId: new ObjectId() }, $unset: { fechaBaja: '' } }
          : { $set: { activo: false, fechaBaja: ahora, fechaModificacion: ahora } }, { session: transaccion })
        if (!cambio.matchedCount) throw new ErrorSolicitud(409, 'La ficha no existe o ya tiene ese estado.')
        if (!activo) {
          // Liberamos los cupos y conservamos los movimientos del turno como historial.
          await base.collection<Turno>('turnos').updateMany({ clientes: id }, {
            $pull: { clientes: id },
            $push: { historialClientes: { clienteId: id, accion: 'BAJA_CLIENTE', fecha: ahora, usuarioId: new ObjectId(personal.id) } },
          }, { session: transaccion })
        }
      })
      responder(respuesta, 200, { mensaje: activo ? 'Cliente reactivado. Podés volver a asignarle turnos.' : 'Cliente dado de baja. Se conservó su historial y se liberaron sus cupos.' })
      return
    }

    // 4. Vinculación con una cuenta que ya se registró en la web.
    if (ruta === '/api/clientes/vincular') {
      const clienteId = leerTexto(datos, 'clienteId', 24, true)
      const correoCuenta = leerTexto(
        datos,
        'correoCuenta',
        254,
        true
      ).toLowerCase()

      if (!/^[a-f0-9]{24}$/i.test(clienteId)) {
        throw new ErrorSolicitud(400, 'Seleccioná un cliente válido.')
      }

      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoCuenta)) {
        throw new ErrorSolicitud(
          400,
          'Ingresá un correo de cuenta válido.',
          ['correoCuenta']
        )
      }

      if (datos.confirmado !== true) {
        throw new ErrorSolicitud(
          400,
          'Confirmá que verificaste a quién pertenece la cuenta.',
          ['confirmado']
        )
      }

      await prepararIndices(db)

      await dependencias.transaccion(async (base, transaccion) => {
        const cliente = await base.collection('clientes').findOne(
          { _id: new ObjectId(clienteId), activo: true },
          {
            session: transaccion,
            projection: { usuarioId: 1 },
          }
        )

        if (!cliente) {
          throw new ErrorSolicitud(404, 'El cliente no existe o está inactivo.')
        }

        if (cliente.usuarioId != null) {
          throw new ErrorSolicitud(409, 'Este cliente ya tiene una cuenta vinculada.')
        }

        const usuario = await base.collection('usuarios').findOne(
          {
            email: correoCuenta,
            rol: 'USUARIO',
            activo: true,
          },
          {
            session: transaccion,
            projection: { clienteId: 1 },
          }
        )

        if (!usuario) {
          throw new ErrorSolicitud(
            404,
            'No encontramos una cuenta de cliente activa con ese correo.',
            ['correoCuenta']
          )
        }

        if (usuario.clienteId != null) {
          throw new ErrorSolicitud(
            409,
            'La cuenta ya está vinculada con otra ficha.',
            ['correoCuenta']
          )
        }

        const fechaActual = new Date()

        // null en el filtro también coincide con un campo inexistente.
        const cambioUsuario = await base.collection('usuarios').updateOne(
          {
            _id: usuario._id,
            clienteId: null,
            activo: true,
            rol: 'USUARIO',
          },
          {
            $set: {
              clienteId: cliente._id,
              fechaModificacion: fechaActual,
            },
          },
          { session: transaccion }
        )

        const cambioCliente = await base.collection('clientes').updateOne(
          {
            _id: cliente._id,
            usuarioId: null,
            activo: true,
          },
          {
            $set: {
              usuarioId: usuario._id,
              fechaModificacion: fechaActual,
            },
          },
          { session: transaccion }
        )

        if (
          cambioUsuario.matchedCount !== 1 ||
          cambioCliente.matchedCount !== 1
        ) {
          throw new ErrorSolicitud(
            409,
            'La vinculación cambió durante la operación. Actualizá el listado.'
          )
        }
      })

      responder(respuesta, 200, {
        mensaje: 'Cuenta vinculada correctamente.',
      })
      return
    }

    throw new ErrorSolicitud(404, 'Ruta no encontrada.')
  } catch (error) {
    if (error instanceof ErrorHTTP) {
      responder(respuesta, error.estado, { mensaje: error.message, campos: error.campos })
      return
    }
    if (error instanceof ErrorSolicitud) {
      responder(respuesta, error.estado, {
        mensaje: error.message,
        campos: error.campos,
      })
      return
    }

    if (error instanceof MongoServerError && error.code === 11000) {
      const esDni = Boolean(error.keyPattern?.dni)

      responder(respuesta, 409, {
        mensaje: esDni
          ? 'Ya existe un cliente con ese DNI.'
          : 'La cuenta o la ficha ya tienen una vinculación.',
        campos: esDni ? ['dni'] : ['correoCuenta'],
      })
      return
    }

    responder(respuesta, 500, {
      mensaje: 'No pudimos completar la operación. Intentá nuevamente.',
    })
  }
}
}

export const gestionarClientes = crearGestorClientes()
