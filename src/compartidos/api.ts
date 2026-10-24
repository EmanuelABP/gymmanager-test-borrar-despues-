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
export function elemento<T extends HTMLElement = HTMLElement>(id: string): T {
    const encontrado = document.getElementById(id);
    if (!encontrado)
        throw new Error(`Falta el elemento ${id}.`);
    return encontrado as T;
}
export function avisar(error: unknown, exito = false): void {
    const mensaje = elemento('mensaje-global');
    mensaje.textContent = error instanceof Error ? error.message : String(error);
    mensaje.dataset.estado = exito ? 'exito' : 'error';
    mensaje.setAttribute('role', exito ? 'status' : 'alert');
}
// Las cadenas de la base se colocan como texto, nunca como HTML.
export function nodo<K extends keyof HTMLElementTagNameMap>(etiqueta: K, texto = '', clase = ''): HTMLElementTagNameMap[K] {
    const resultado = document.createElement(etiqueta);
    resultado.textContent = texto;
    resultado.className = clase;
    return resultado;
}
export function boton(texto: string, accion: () => void | Promise<void>, peligro = false): HTMLButtonElement {
    const resultado = nodo('button', texto, peligro ? 'boton peligro' : 'boton secundario');
    resultado.type = 'button';
    resultado.addEventListener('click', async () => {
        if (resultado.disabled)
            return;
        resultado.disabled = true;
        try {
            await accion();
        }
        catch (error) {
            avisar(error);
        }
        finally {
            resultado.disabled = false;
        }
    });
    return resultado;
}
export function enlace(texto: string, destino: string): HTMLAnchorElement {
    const resultado = nodo('a', texto, 'boton secundario');
    resultado.href = destino;
    return resultado;
}
export function opciones(select: HTMLSelectElement, filas: {
    valor: string;
    texto: string;
}[], vacio = 'Seleccioná una opción'): void {
    select.replaceChildren(new Option(vacio, ''), ...filas.map(fila => new Option(fila.texto, fila.valor)));
}
export function tabla(contenedor: HTMLElement, encabezados: string[], filas: (string | Node)[][]): void {
    contenedor.replaceChildren();
    if (!filas.length) {
        contenedor.append(nodo('p', 'Todavía no hay registros para mostrar.', 'estado-vacio'));
        return;
    }
    const envoltorio = nodo('div', '', 'tabla-desplazable');
    envoltorio.tabIndex = 0;
    const tabla = nodo('table'), cabecera = nodo('thead'), fila = nodo('tr');
    for (const titulo of encabezados) {
        const celda = nodo('th', titulo);
        celda.scope = 'col';
        fila.append(celda);
    }
    cabecera.append(fila);
    const cuerpo = nodo('tbody');
    for (const valores of filas) {
        const fila = nodo('tr');
        for (const valor of valores) {
            const celda = nodo('td');
            celda.append(valor);
            fila.append(celda);
        }
        cuerpo.append(fila);
    }
    tabla.append(cabecera, cuerpo);
    envoltorio.append(tabla);
    contenedor.append(envoltorio);
}
export function acciones(...hijos: Node[]): HTMLElement { const grupo = nodo('div', '', 'acciones'); grupo.append(...hijos); return grupo; }
export const nombreCompleto = (persona: {
    nombre: string;
    apellido: string;
}) => `${persona.apellido}, ${persona.nombre}`;
export const fecha = (valor?: string) => valor ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'medium' }).format(new Date(valor)) : '—';
export const hoy = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Argentina/Buenos_Aires' });
export const dinero = (valor: string) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(valor));
export function manejarFormulario(id: string, enviar: (datos: Record<string, string>, formulario: HTMLFormElement) => Promise<string | void>): void {
    const formulario = elemento<HTMLFormElement>(id);
    const mensaje = nodo('p', '', 'mensaje-formulario');
    mensaje.id = `${id}-mensaje`;
    mensaje.setAttribute('role', 'status');
    formulario.append(mensaje);
    formulario.noValidate = true;
    let enviando = false;
    formulario.addEventListener('input', evento => {
        if (evento.target instanceof HTMLElement) {
            evento.target.removeAttribute('aria-invalid');
            evento.target.removeAttribute('aria-describedby');
        }
        mensaje.textContent = '';
    });
    formulario.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        if (enviando)
            return;
        formulario.querySelectorAll('[aria-invalid]').forEach(campo => campo.removeAttribute('aria-invalid'));
        const campos = [...formulario.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea')];
        const erroresCampo = (campo: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null => {
            if (campo.disabled)
                return null;
            const etiqueta = (campo.labels?.[0]?.firstChild?.textContent ?? 'El campo').replace('*', '').trim();
            if (campo.required && (campo instanceof HTMLInputElement && campo.type === 'checkbox' ? !campo.checked : !campo.value.trim()))
                return 'Completá los campos marcados.';
            if ('minLength' in campo && campo.minLength > 0 && campo.value && campo.value.length < campo.minLength)
                return `${etiqueta}: ingresá al menos ${campo.minLength} caracteres.`;
            if ('maxLength' in campo && campo.maxLength > 0 && campo.value.length > campo.maxLength)
                return `${etiqueta}: admite hasta ${campo.maxLength} caracteres.`;
            if (campo instanceof HTMLInputElement && campo.type === 'password' && campo.name !== 'actual' && new TextEncoder().encode(campo.value).length > 72)
                return 'La nueva contraseña admite hasta 72 bytes.';
            if (campo.validity.typeMismatch)
                return `${etiqueta}: ingresá un correo válido.`;
            if (campo.validity.rangeUnderflow)
                return `${etiqueta}: el mínimo es ${(campo as HTMLInputElement).min}.`;
            if (campo.validity.rangeOverflow)
                return `${etiqueta}: el máximo es ${(campo as HTMLInputElement).max}.`;
            if (!campo.checkValidity())
                return `${etiqueta}: revisá el formato del valor ingresado.`;
            return null;
        };
        const invalidos = campos.filter(campo => erroresCampo(campo));
        if (invalidos.length) {
            for (const campo of invalidos) {
                campo.setAttribute('aria-invalid', 'true');
                campo.setAttribute('aria-describedby', mensaje.id);
            }
            mensaje.dataset.estado = 'error';
            mensaje.textContent = [...new Set(invalidos.map(campo => erroresCampo(campo)))].join(' ');
            const editor = invalidos[0]?.closest<HTMLElement>('[data-editor-ejercicio]');
            if (editor)
                editor.hidden = false;
            invalidos[0]?.focus();
            return;
        }
        const datos = Object.fromEntries(new FormData(formulario).entries()) as Record<string, string>;
        enviando = true;
        const controles = [...formulario.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('button, input, select, textarea')];
        const estados = controles.map(campo => campo.disabled);
        controles.forEach(campo => { campo.disabled = true; });
        formulario.setAttribute('aria-busy', 'true');
        mensaje.textContent = 'Guardando…';
        try {
            const texto = await enviar(datos, formulario);
            mensaje.dataset.estado = 'exito';
            mensaje.textContent = texto ?? 'Guardado correctamente.';
        }
        catch (error) {
            mensaje.dataset.estado = 'error';
            mensaje.textContent = error instanceof Error ? error.message : 'No pudimos guardar los datos.';
            if (error instanceof ErrorAPI) {
                for (const nombre of error.campos) {
                    const campo = formulario.elements.namedItem(nombre);
                    if (campo instanceof HTMLElement) {
                        campo.setAttribute('aria-invalid', 'true');
                        campo.setAttribute('aria-describedby', mensaje.id);
                    }
                }
            }
        }
        finally {
            controles.forEach((campo, indice) => { campo.disabled = estados[indice] ?? false; });
            enviando = false;
            formulario.removeAttribute('aria-busy');
            formulario.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        }
    });
}
