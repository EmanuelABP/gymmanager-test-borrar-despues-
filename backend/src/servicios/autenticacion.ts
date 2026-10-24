import { createHash, randomBytes } from 'node:crypto';
import type { ServerResponse } from 'node:http';
import type { Db, ObjectId } from 'mongodb';
export function nuevaSesion(usuarioId: ObjectId) {
    const token = randomBytes(32).toString('hex');
    return { token, documento: { usuarioId, tokenHash: createHash('sha256').update(token).digest('hex'), fechaCreacion: new Date(), fechaVencimiento: new Date(Date.now() + 8 * 60 * 60000) } };
}
export async function prepararSesiones(db: Db): Promise<void> {
    await db.collection('sesiones').createIndex({ tokenHash: 1 }, { unique: true });
    await db.collection('sesiones').createIndex({ fechaVencimiento: 1 }, { expireAfterSeconds: 0 });
}
export function enviarCookie(respuesta: ServerResponse, token: string): void {
    respuesta.setHeader('Set-Cookie', `gymmanager_sesion=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
}
export const esEntrenador = (usuario: {
    rol: string;
    esEntrenador?: boolean;
}) => usuario.rol === 'ENTRENADOR' || (usuario.rol === 'ADMIN' && usuario.esEntrenador === true);
