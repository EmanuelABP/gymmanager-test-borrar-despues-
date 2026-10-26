import type { IncomingMessage, ServerResponse } from 'node:http';
import { hash } from 'bcryptjs';
import { MongoServerError } from 'mongodb';
import { conectarDB, ejecutarTransaccion } from '../db.ts';
import { nuevaSesion, prepararSesiones, enviarCookie } from '../servicios/autenticacion.ts';
import { ErrorHTTP, leerJSON, responderMensaje as responder } from '../compartidos/http.ts';
export function crearRegistrador(dependencias = { conectar: conectarDB, transaccion: ejecutarTransaccion }) {
    return async function registrarUsuario(solicitud: IncomingMessage, respuesta: ServerResponse): Promise<void> {
        try {
            const campos = await leerJSON(solicitud, 16_384);
            // No confiamos solamente en las validaciones del navegador.
            if (typeof campos.nombre !== 'string' ||
                typeof campos.apellido !== 'string' ||
                typeof campos.email !== 'string' ||
                typeof campos.contrasena !== 'string') {
                responder(respuesta, 400, 'Completá los datos del registro.');
                return;
            }
            const nombre = campos.nombre.trim();
            const apellido = campos.apellido.trim();
            const email = campos.email.trim().toLowerCase();
            const contrasena = campos.contrasena;
            if (!nombre || !apellido || !email || !contrasena.trim()) {
                responder(respuesta, 400, 'Completá todos los campos.');
                return;
            }
            if (nombre.length > 100 || apellido.length > 100) {
                responder(respuesta, 400, 'El nombre y el apellido admiten hasta 100 caracteres.');
                return;
            }
            const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email.length > 254 || !formatoCorreo.test(email)) {
                responder(respuesta, 400, 'Ingresá un correo electrónico válido.');
                return;
            }
            if (contrasena.length < 8) {
                responder(respuesta, 400, 'La contraseña debe tener al menos 8 caracteres.');
                return;
            }
            if (Buffer.byteLength(contrasena, 'utf8') > 72) {
                responder(respuesta, 400, 'La contraseña es demasiado extensa: admite hasta 72 bytes.');
                return;
            }
            // Generamos el hash. Nunca guardamos la contraseña original.
            const passwordHash = await hash(contrasena, 12);
            const db = await dependencias.conectar();
            const fechaActual = new Date();
            // Guardamos únicamente los campos definidos por nosotros.
            // El usuario no puede elegir un rol administrativo.
            await prepararSesiones(db);
            let token = '';
            await dependencias.transaccion(async (base, session) => {
                const creado = await base.collection('usuarios').insertOne({
                    nombre,
                    apellido,
                    email,
                    passwordHash,
                    rol: 'USUARIO',
                    activo: true,
                    fechaCreacion: fechaActual,
                    fechaModificacion: fechaActual,
                }, { session });
                const sesion = nuevaSesion(creado.insertedId);
                await base.collection('sesiones').insertOne(sesion.documento, { session });
                token = sesion.token;
            });
            enviarCookie(respuesta, token);
            // Omitimos clienteId mientras la cuenta no tenga una ficha vinculada.
            responder(respuesta, 201, 'Tu cuenta se creó correctamente.');
        }
        catch (error) {
            if (error instanceof ErrorHTTP) { responder(respuesta, error.estado, error.message); return; }
            // El índice único de MongoDB también protege contra registros simultáneos.
            if (error instanceof MongoServerError &&
                error.code === 11000 &&
                error.keyPattern?.email) {
                responder(respuesta, 409, 'Ese correo ya está registrado.');
                return;
            }
            // No devolvemos errores internos ni datos privados de conexión.
            responder(respuesta, 500, 'No pudimos crear la cuenta. Intentá nuevamente.');
        }
    };
}
export const registrarUsuario = crearRegistrador();
