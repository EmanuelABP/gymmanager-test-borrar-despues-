import { MongoClient } from 'mongodb'
import type { Db, ClientSession } from 'mongodb'

let client: MongoClient | undefined
let connection: Promise<Db> | undefined

// Todos los modulos reutilizan este cliente y su conjunto de conexiones.
export async function conectarDB(): Promise<Db> {
  if (connection) return connection

  const uri = process.env.MONGODB_URI?.trim()
  const dbName = process.env.MONGODB_DB?.trim()

  if (!uri || !dbName) {
    throw new Error('Completa MONGODB_URI y MONGODB_DB en backend/.env.')
  }

  const mongoClient = new MongoClient(uri, {
    serverSelectionTimeoutMS: 10_000,
  })
  client = mongoClient

  connection = (async () => {
    try {
      await mongoClient.connect()
      const db = mongoClient.db(dbName)
      await db.command({ ping: 1 })
      return db
    } catch (error) {
      await mongoClient.close()
      connection = undefined
      client = undefined
      throw error
    }
  })()

  return connection
}

// Cerrar solo al finalizar el proceso, no despues de cada consulta.
export async function cerrarDB(): Promise<void> {
  await client?.close()
  client = undefined
  connection = undefined
}

// Ejecuta varias operaciones como una única transacción.
// Esta sesión de MongoDB es distinta de la sesión de login del usuario.
export async function ejecutarTransaccion(
  operacion: (db: Db, transaccion: ClientSession) => Promise<void>
): Promise<void> {
  const db = await conectarDB()

  if (!client) {
    throw new Error('No está disponible el cliente de MongoDB.')
  }

  const transaccion = client.startSession()

  try {
    await transaccion.withTransaction(async () => {
      await operacion(db, transaccion)
    })
  } finally {
    await transaccion.endSession()
  }
}