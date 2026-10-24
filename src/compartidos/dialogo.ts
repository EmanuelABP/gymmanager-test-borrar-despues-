// Confirmación accesible que conserva el estilo de la aplicación.
let pendiente: Promise<boolean> | null = null;
export function confirmar(mensaje: string, titulo = 'Confirmar acción'): Promise<boolean> {
    if (pendiente)
        return Promise.resolve(false);
    const anterior = document.activeElement as HTMLElement | null;
    const dialogo = document.createElement('dialog');
    dialogo.className = 'dialogo-confirmacion';
    const encabezado = document.createElement('h2');
    encabezado.id = 'titulo-confirmacion';
    encabezado.textContent = titulo;
    const detalle = document.createElement('p');
    detalle.textContent = mensaje;
    dialogo.setAttribute('aria-labelledby', encabezado.id);
    const acciones = document.createElement('div');
    acciones.className = 'acciones';
    const cancelar = document.createElement('button');
    cancelar.className = 'boton secundario';
    cancelar.textContent = 'Cancelar';
    const aceptar = document.createElement('button');
    aceptar.className = 'boton';
    aceptar.textContent = 'Confirmar';
    acciones.append(cancelar, aceptar);
    dialogo.append(encabezado, detalle, acciones);
    document.body.append(dialogo);
    pendiente = new Promise<boolean>(resolver => {
        const terminar = (aceptado: boolean) => { dialogo.close(); dialogo.remove(); pendiente = null; anterior?.focus(); resolver(aceptado); };
        cancelar.addEventListener('click', () => terminar(false));
        aceptar.addEventListener('click', () => terminar(true));
        dialogo.addEventListener('cancel', evento => { evento.preventDefault(); terminar(false); });
    });
    dialogo.showModal();
    cancelar.focus();
    return pendiente;
}
