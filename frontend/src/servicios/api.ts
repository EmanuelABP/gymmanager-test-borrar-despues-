import { obtenerSesion, redirigirSegunRol } from './sesion.ts';
export class ErrorAPI extends Error {
    campos: string[];
    constructor(mensaje: string, campos: string[] = []) { super(mensaje); this.campos = campos; }
}
export async function api<T = {
    mensaje: string;
}>(ruta: string, datos?: unknown): Promise<T> {
    const respuesta = await fetch(ruta, {
        method: datos === undefined ? 'GET' : 'POST', credentials: 'include', cache: 'no-store',
        ...(datos === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(datos) }),
    });
    if (respuesta.status === 401)
        window.location.replace('/src/auth/login/login.html');
    if (respuesta.status === 403) {
        const usuario = await obtenerSesion();
        if (usuario)
            redirigirSegunRol(usuario);
    }
    const contenido = await respuesta.json();
    if (!respuesta.ok)
        throw new ErrorAPI(contenido.mensaje ?? 'No pudimos completar la operación.', Array.isArray(contenido.campos) ? contenido.campos : []);
    return contenido as T;
}
