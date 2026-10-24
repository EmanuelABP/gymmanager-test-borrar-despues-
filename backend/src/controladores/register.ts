import type { IncomingMessage, ServerResponse } from 'node:http';
import { hash } from 'bcryptjs';
import { MongoServerError } from 'mongodb';
import { conectarDB, ejecutarTransaccion } from '../db.ts';
import { nuevaSesion, prepararSesiones, enviarCookie } from '../servicios/autenticacion.ts';
// Envía una respuesta JSON al navegador.
function responder(respuesta: ServerResponse, estado: number, mensaje: string): void {
    respuesta.writeHead(estado, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
    });
    respuesta.end(JSON.stringify({ mensaje }));
}
export function crearRegistrador(dependencias = { conectar: conectarDB, transaccion: ejecutarTransaccion }) {
    return async function registrarUsuario(solicitud: IncomingMessage, respuesta: ServerResponse): Promise<void> {
        try {
            // Aceptamos únicamente datos enviados como JSON.
            const tipoContenido = solicitud.headers['content-type']
                ?.split(';')[0]
                ?.trim()
                .toLowerCase();
            if (tipoContenido !== 'application/json') {
                responder(respuesta, 415, 'El formato de los datos no es válido.');
                return;
            }
            // Leemos el cuerpo, limitándolo a 16 KB.
            let cuerpo = '';
            let demasiadoGrande = false;
            solicitud.setEncoding('utf8');
            for await (const fragmento of solicitud) {
                if (demasiadoGrande)
                    continue;
                cuerpo += fragmento;
                if (Buffer.byteLength(cuerpo, 'utf8') > 16384) {
                    demasiadoGrande = true;
                    cuerpo = '';
                }
            }
            if (demasiadoGrande) {
                responder(respuesta, 413, 'Los datos enviados son demasiado extensos.');
                return;
            }
            // Convertimos el texto JSON en un objeto.
            let datos: unknown;
            try {
                datos = JSON.parse(cuerpo);
            }
            catch {
                responder(respuesta, 400, 'Los datos enviados no tienen un JSON válido.');
                return;
            }
            if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
                responder(respuesta, 400, 'Los datos del registro no son válidos.');
                return;
            }
            const campos = datos as Record<string, unknown>;
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
