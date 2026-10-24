import { createServer } from 'node:http'
import { conectarDB, cerrarDB } from './db.ts'
import { registrarUsuario } from './controladores/register.ts'

const server = createServer((request, response) => {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
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

  response.writeHead(404)
  response.end(JSON.stringify({ mensaje: 'Ruta no encontrada' }))
})

async function iniciar(): Promise<void> {
  const port = Number(process.env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT debe ser un entero entre 1 y 65535.')
  }

  await conectarDB()
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
