// Servidor aislado para revisar la interfaz sin usar datos reales de Atlas.
// Solo se inicia explícitamente; no forma parte del servidor de la aplicación.
import { createServer } from 'node:http'
import { memoria } from './memoria.ts'
import { semilla, usuarioSesion } from './fixtures.ts'
import { crearGestorAplicacion } from '../src/controladores/aplicacion.ts'
import { crearGestorClientes } from '../src/controladores/clientes.ts'
import { servirWeb } from '../src/servicios/archivos.ts'
import { responder } from '../src/compartidos/http.ts'

const almacen = memoria(semilla())
const usuario = async (req: import('node:http').IncomingMessage) => {
  const rol = /prueba_rol=(ADMIN|ENTRENADOR|USUARIO)/.exec(req.headers.cookie ?? '')?.[1]
  return rol ? usuarioSesion(rol) : null
}
const deps = { conectar: async () => almacen.db, usuario, transaccion: almacen.transaccion }
const aplicacion = crearGestorAplicacion(deps), clientes = crearGestorClientes(deps)
const server = createServer((req, res) => {
  const ruta = new URL(req.url ?? '/', 'http://localhost').pathname
  if (ruta.startsWith('/__pruebas/rol/')) {
    const rol = ruta.split('/').at(-1)!
    if (!['ADMIN', 'ENTRENADOR', 'USUARIO', 'NINGUNO'].includes(rol)) { res.writeHead(400); res.end(); return }
    res.writeHead(302, { 'Set-Cookie': 'prueba_rol=' + rol + '; HttpOnly; SameSite=Lax; Path=/', Location: '/' }); res.end(); return
  }
  if (ruta === '/api/usuarios/sesion') { void usuario(req).then(u => responder(res, u ? 200 : 401, u ? { usuario: u } : { mensaje: 'Sin sesión' })); return }
  if (ruta === '/api/usuarios/logout') { res.setHeader('Set-Cookie', 'prueba_rol=; Max-Age=0; Path=/'); responder(res, 200, { mensaje: 'Sesión cerrada' }); return }
  if (ruta.startsWith('/api/clientes')) { void clientes(req, res); return }
  if (ruta.startsWith('/api/')) { void aplicacion(req, res); return }
  void servirWeb(req, res)
})
server.listen(3199, '127.0.0.1', () => console.log('Demo aislada: http://127.0.0.1:3199/__pruebas/rol/ADMIN'))
