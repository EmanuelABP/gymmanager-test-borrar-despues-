import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { conectarDB } from '../db.ts';
import { nuevaSesion, prepararSesiones, enviarCookie } from '../servicios/autenticacion.ts';
import { ErrorHTTP, leerJSON, responderMensaje as responder } from '../compartidos/http.ts';
// Permite hacer una comparación incluso cuando el correo no existe.
// Así evitamos responder inmediatamente solo en ese caso.
const hashDeRespaldo = hash(randomBytes(32).toString('hex'), 12);
export function crearIniciadorSesion(dependencias = { conectar: conectarDB }) {
    return async function iniciarSesion(solicitud: IncomingMessage, respuesta: ServerResponse): Promise<void> {
        try {
            const campos = await leerJSON(solicitud, 16384);
            // 3. Validamos nuevamente desde el servidor.
            if (typeof campos.email !== 'string' ||
                typeof campos.contrasena !== 'string') {
                responder(respuesta, 400, 'Completá el correo y la contraseña.');
                return;
            }
            const email = campos.email.trim().toLowerCase();
            // La contraseña se compara exactamente como fue escrita.
            const contrasena = campos.contrasena;
            if (!email || !contrasena.trim()) {
                responder(respuesta, 400, 'Completá el correo y la contraseña.');
                return;
            }
            const formatoCorreo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (email.length > 254 || !formatoCorreo.test(email)) {
                responder(respuesta, 400, 'Ingresá un correo electrónico válido.');
                return;
            }
            // Evitamos que bcrypt ignore silenciosamente parte de la contraseña.
            if (Buffer.byteLength(contrasena, 'utf8') > 72) {
                responder(respuesta, 400, 'La contraseña es demasiado extensa.');
                return;
            }
            // 4. Buscamos la cuenta y comparamos su hash.
            const db = await dependencias.conectar();
            const usuario = await db.collection('usuarios').findOne({ email });
            const hashGuardado = typeof usuario?.passwordHash === 'string'
                ? usuario.passwordHash
                : await hashDeRespaldo;
            const contrasenaCorrecta = await compare(contrasena, hashGuardado);
            // Usamos el mismo mensaje para no revelar si existe una cuenta
            // o si está desactivada.
            if (!usuario || usuario.activo !== true || !contrasenaCorrecta) {
                responder(respuesta, 401, 'Correo o contraseña incorrectos.');
                return;
            }
            // Una única implementación compartida con registro y cambio de contraseña.
            await prepararSesiones(db);
            const sesion = nuevaSesion(usuario._id);
            await db.collection('sesiones').insertOne(sesion.documento);
            enviarCookie(respuesta, sesion.token);
            // Nunca devolvemos el hash de contraseña ni el token en el JSON.
            responder(respuesta, 200, 'Iniciaste sesión correctamente.');
        }
        catch (error) {
            if (error instanceof ErrorHTTP) {
                responder(respuesta, error.estado, error.message);
                return;
            }
            // No exponemos errores internos ni datos privados.
            responder(respuesta, 500, 'No pudimos iniciar sesión. Intentá nuevamente.');
        }
    };
}
export const iniciarSesion = crearIniciadorSesion();
