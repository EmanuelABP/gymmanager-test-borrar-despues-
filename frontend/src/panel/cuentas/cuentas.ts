import { prepararPanel } from '../estructura.ts';
import { confirmar } from '../../compartidos/dialogo.ts';
import { api, elemento, manejarFormulario, tabla, acciones, boton, nodo, avisar, nombreCompleto } from '../../compartidos/api.ts';
import type { Cuenta } from '../../compartidos/modelos.ts';
let cuentas: Cuenta[] = [];
let miId = '';
function mostrar(): void {
    const buscar = elemento<HTMLInputElement>('buscar').value.toLowerCase();
    tabla(elemento('listado'), ['Persona', 'Correo', 'Rol', 'Estado', 'Permisos y acciones'], cuentas.filter(c => [c.nombre, c.apellido, c.email].join(' ').toLowerCase().includes(buscar)).map(c => {
        const rol = nodo('select');
        rol.setAttribute('aria-label', 'Rol de ' + nombreCompleto(c));
        rol.append(...['USUARIO', 'ENTRENADOR', 'ADMIN'].map(r => new Option(r, r)));
        rol.value = c.rol;
        rol.disabled = c._id === miId;
        const etiqueta = nodo('label', '', 'opcion-entrenador');
        const entrena = nodo('input');
        entrena.type = 'checkbox';
        entrena.checked = c.esEntrenador === true;
        etiqueta.append(entrena, document.createTextNode('También es ENTRENADOR'));
        etiqueta.hidden = rol.value !== 'ADMIN';
        rol.addEventListener('change', () => { etiqueta.hidden = rol.value !== 'ADMIN'; });
        const grupo = acciones(rol, etiqueta, boton('Guardar rol', async () => {
            if (!await confirmar('¿Guardar los permisos de ' + nombreCompleto(c) + '? Su ficha se conservará. Se cerrarán sus otras sesiones si cambiaste sus permisos.', 'Cambiar rol'))
                return;
            const r = await api('/api/cuentas/actualizar', { id: c._id, rol: rol.value, activo: c.activo, esEntrenador: entrena.checked });
            await cargar();
            avisar(r.mensaje, true);
        }));
        if (c._id !== miId)
            grupo.append(boton(c.activo ? 'Desactivar cuenta' : 'Reactivar cuenta', async () => {
                if (!await confirmar('¿Cambiar el estado de acceso de ' + nombreCompleto(c) + '?', c.activo ? 'Desactivar cuenta' : 'Reactivar cuenta'))
                    return;
                const r = await api('/api/cuentas/actualizar', { id: c._id, rol: c.rol, activo: !c.activo, esEntrenador: c.esEntrenador === true });
                await cargar();
                avisar(r.mensaje, true);
            }, c.activo));
        if (!c.activo && c._id !== miId) grupo.append(boton('Eliminar definitivamente', async () => {
            if (!await confirmar('La cuenta de ' + nombreCompleto(c) + ' y sus sesiones se borrarán para siempre. Su ficha de cliente se conservará sin vincular. No podrás recuperar la cuenta. Si figura como responsable en historiales, no se permitirá el borrado.', 'Eliminar cuenta definitivamente')) return;
            const r = await api('/api/eliminar', { entidad: 'usuarios', id: c._id, confirmado: true }); await cargar(); avisar(r.mensaje, true);
        }, true));
        return [nombreCompleto(c), c.email, c.rol + (c.rol === 'ADMIN' && c.esEntrenador ? ' + ENTRENADOR' : ''), c.activo ? 'Activa' : 'Inactiva', grupo];
    }));
}
async function cargar(): Promise<void> { cuentas = (await api<{
    cuentas: Cuenta[];
}>('/api/cuentas')).cuentas; mostrar(); }
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Cuentas', ['ADMIN']);
    if (!usuario)
        return;
    miId = usuario.id;
    manejarFormulario('formulario-cuenta', async (datos, formulario) => { const r = await api('/api/cuentas', { ...datos, esEntrenador: datos.esEntrenador === 'on' }); formulario.reset(); await cargar(); return r.mensaje; });
    elemento('buscar').addEventListener('input', mostrar);
    await cargar();
}
void iniciar().catch(avisar);
