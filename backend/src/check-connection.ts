import { conectarDB, cerrarDB } from './db.ts'

try {
  await conectarDB()
  console.log('Conexion y ping a MongoDB Atlas exitosos.')
} catch {
  // No imprimir el error completo: podria contener datos de conexion.
  console.error('No se pudo conectar. Revisa MONGODB_URI, MONGODB_DB, los permisos del usuario y Network Access en Atlas.')
  process.exitCode = 1
} finally {
  await cerrarDB()
}
