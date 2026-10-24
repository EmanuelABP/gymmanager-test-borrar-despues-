import { createServer } from 'node:http'
import { conectarDB, cerrarDB } from './db.ts'
import { registrarUsuario } from './controladores/register.ts'
import { iniciarSesion } from './controladores/login.ts'
import { consultarSesion, cerrarSesion,} from './controladores/sesion.ts'
import { gestionarClientes } from './controladores/clientes.ts'
import { gestionarAplicacion, actualizarVencimientos } from './controladores/aplicacion.ts'
import { servirWeb } from './servicios/archivos.ts'

const intentos = new Map<string, { cantidad: number; vence: number }>()

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  if (request.method === 'POST' && request.headers['sec-fetch-site'] === 'cross-site') {
    response.writeHead(403); response.end(JSON.stringify({ mensaje: 'Solicitud de otro sitio rechazada.' })); return
  }
  const rutaInicial = request.url?.split('?')[0]
  const autenticacion = ['/api/usuarios/login', '/api/usuarios/registro']
  if (request.method === 'POST' && autenticacion.includes(rutaInicial ?? '')) {
    const ahora = Date.now()
    for (const [clave, intento] of intentos) if (intento.vence <= ahora) intentos.delete(clave)
    const clave = request.socket.remoteAddress ?? 'local'
    const intento = intentos.get(clave) ?? { cantidad: 0, vence: ahora + 15 * 60_000 }
    if (intento.cantidad >= 50 || intentos.size >= 10_000) {
      response.writeHead(429, { 'Retry-After': '900' }); response.end(JSON.stringify({ mensaje: 'Demasiados intentos. Esperá unos minutos antes de volver a intentar.' })); return
    }
    intento.cantidad++; intentos.set(clave, intento)
  }
    // Recibe el formulario de creación de cuentas.
  if (
    request.method === 'POST' &&
    request.url === '/api/usuarios/registro'
  ) {
    void registrarUsuario(request, response)
    return
  }
  // Indica que el servidor esta iniciado. Atlas se verifica al arrancar.
  if (request.method === 'GET' && request.url === '/api/salud') {
    response.writeHead(200)
    response.end(JSON.stringify({ estado: 'ok' }))
    return
  }
  // Recibe las credenciales del formulario de login.
  if (
    request.method === 'POST' &&
    request.url === '/api/usuarios/login'
  ) {
    void iniciarSesion(request, response)
    return
  }
  // Consulta la sesión del navegador.
  if (
    request.method === 'GET' &&
    request.url === '/api/usuarios/sesion'
  ) {
    void consultarSesion(request, response)
    return
  }

  // Cierra la sesión actual.
  if (
    request.method === 'POST' &&
    request.url === '/api/usuarios/logout'
  ) {
    void cerrarSesion(request, response)
    return
    }
    // Gestión de clientes: los permisos se comprueban en el controlador.
  const ruta = request.url?.split('?')[0]

  if (
    ruta === '/api/clientes' ||
    ruta === '/api/clientes/vincular' ||
    ruta === '/api/clientes/editar' ||
    ruta === '/api/clientes/desactivar' ||
    ruta === '/api/clientes/reactivar'
  ) {
    void gestionarClientes(request, response)
    return
  }
  if (ruta?.startsWith('/api/')) {
    void gestionarAplicacion(request, response)
    return
  }
  void servirWeb(request, response)
})

async function iniciar(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.')
  }

  await conectarDB()
  // El vencimiento se comprueba también al consultar pagos y reportes.
  const relojCuotas = setInterval(() => {
    void conectarDB().then(db => actualizarVencimientos(db)).catch(() => {
      console.error('No se pudieron actualizar los vencimientos de cuotas.')
    })
  }, 60_000)
  relojCuotas.unref()
  console.log('Conexion y ping a MongoDB Atlas exitosos.')

  server.on('error', () => {
    console.error('No se pudo abrir el puerto del backend. Revisa PORT y si ya esta ocupado.')
    void cerrarDB().finally(() => { process.exitCode = 1 })
  })

  server.listen(port, () => {
    console.log(`Backend disponible en http://localhost:${port}`)
  })
}

let closing = false
function detener(): void {
  if (closing) return
  closing = true
  server.close(() => {
    void cerrarDB().finally(() => { process.exitCode = 0 })
  })
}

process.once('SIGINT', detener)
process.once('SIGTERM', detener)

iniciar().catch(async () => {
  // Evitar mostrar la URI o credenciales en los mensajes de error.
  console.error('No se pudo iniciar el backend. Revisa la configuracion de Atlas y PORT en backend/.env.')
  await cerrarDB()
  process.exitCode = 1
})
