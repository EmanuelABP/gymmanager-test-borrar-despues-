import { hash } from 'bcryptjs'
import { conectarDB, cerrarDB } from './db.ts'
import { validarContrasena } from './compartidos/http.ts'

// Configuración explícita de la primera cuenta. No se ejecuta al iniciar el servidor.
try {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  const nombre = process.env.ADMIN_NOMBRE?.trim(), apellido = process.env.ADMIN_APELLIDO?.trim()
  const contrasena = validarContrasena(process.env.ADMIN_PASSWORD)
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !nombre || !apellido || nombre.length > 100 || apellido.length > 100) throw new Error('Completá ADMIN_EMAIL, ADMIN_NOMBRE, ADMIN_APELLIDO y ADMIN_PASSWORD en backend/.env.')
  const db = await conectarDB()
  if (await db.collection('usuarios').findOne({ rol: 'ADMIN', activo: true })) throw new Error('Ya existe un administrador activo. Creá más personal desde el panel.')
  await db.collection('usuarios').createIndex({ email: 1 }, { unique: true })
  if (await db.collection('usuarios').findOne({ email })) throw new Error('El correo ya está registrado. Usá otro correo para la primera cuenta administradora.')
  await db.collection('usuarios').insertOne({ nombre, apellido, email, passwordHash: await hash(contrasena, 12), rol: 'ADMIN', activo: true, fechaCreacion: new Date(), fechaModificacion: new Date() })
  console.log('Administrador creado. Quitá ADMIN_PASSWORD del archivo .env.')
} catch (error) {
  console.error(error instanceof Error && error.name !== 'MongoServerError' ? error.message : 'No se pudo crear el administrador. Revisá la conexión y el correo.')
  process.exitCode = 1
} finally { await cerrarDB() }
