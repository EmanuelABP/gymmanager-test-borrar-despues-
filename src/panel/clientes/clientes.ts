import { confirmar } from '../../compartidos/dialogo.ts'
import { prepararPanel } from '../estructura.ts';
import { api, elemento, manejarFormulario, tabla, acciones, boton, enlace, avisar, nombreCompleto } from '../../compartidos/api.ts';
import type { ClienteListado, Ficha } from '../../compartidos/modelos.ts';
let clientes: ClienteListado[] = [];
let administrador = false;
const formulario = elemento<HTMLFormElement>('formulario-cliente');
const vinculo = elemento<HTMLFormElement>('formulario-vinculo');
const campo = (nombre: string) => formulario.elements.namedItem(nombre) as HTMLInputElement;
function cancelarEdicion(): void {
    formulario.reset();
    campo('clienteId').value = '';
    elemento('guardar-cliente').textContent = 'Crear cliente';
    elemento('cancelar-edicion').hidden = true;
    elemento('tarjeta-alta').querySelector('h2')!.textContent = 'Nueva ficha de cliente';
}
async function editar(cliente: ClienteListado): Promise<void> {
    if (formulario.getAttribute('aria-busy') === 'true')
        return;
    const { cliente: ficha } = await api<{
        cliente: Ficha;
    }>('/api/ficha?clienteId=' + cliente.id);
    cancelarEdicion();
    for (const nombre of ['nombre', 'apellido', 'dni', 'telefono', 'email', 'direccion'] as const)
        campo(nombre).value = ficha[nombre] ?? '';
    campo('clienteId').value = cliente.id;
    campo('fechaNacimiento').value = ficha.fechaNacimiento?.slice(0, 10) ?? '';
    campo('emergenciaNombre').value = ficha.contactoEmergencia?.nombre ?? '';
    campo('emergenciaTelefono').value = ficha.contactoEmergencia?.telefono ?? '';
    campo('emergenciaRelacion').value = ficha.contactoEmergencia?.relacion ?? '';
    elemento('guardar-cliente').textContent = 'Guardar cambios';
    elemento('cancelar-edicion').hidden = false;
    elemento('tarjeta-alta').querySelector('h2')!.textContent = 'Editar: ' + nombreCompleto(ficha);
    elemento('tarjeta-alta').scrollIntoView({ block: 'start' });
    campo('nombre').focus();
}
function mostrar(): void {
    const busqueda = elemento<HTMLInputElement>('buscar').value.toLocaleLowerCase('es');
    const estado = elemento<HTMLSelectElement>('filtro-estado').value;
    const filtrados = clientes.filter(cliente => [cliente.nombre, cliente.apellido, cliente.dni, cliente.email, cliente.telefono].join(' ').toLocaleLowerCase('es').includes(busqueda) && (estado === 'todos' || cliente.activo === (estado === 'activos')));
    tabla(elemento('listado'), ['Cliente', 'DNI', 'Contacto', 'Estado', 'Cuenta', 'Acciones'], filtrados.map(cliente => {
        const grupo = acciones(enlace('Rutinas', '../rutinas/rutinas.html?clienteId=' + cliente.id), enlace('Historia clínica', '/src/cliente/historia/historia.html?clienteId=' + cliente.id));
        if (administrador) {
            grupo.append(boton('Editar', () => editar(cliente)), boton(cliente.activo ? 'Dar de baja' : 'Reactivar', async () => {
                if (formulario.getAttribute('aria-busy') === 'true')
                    return;
                if (!await confirmar(cliente.activo ? '¿Dar de baja a ' + nombreCompleto(cliente) + '? Se conserva el historial y se liberan sus cupos.' : '¿Reactivar esta ficha?'))
                    return;
                const resultado = await api('/api/clientes/' + (cliente.activo ? 'desactivar' : 'reactivar'), { clienteId: cliente.id });
                if (campo('clienteId').value === cliente.id)
                    cancelarEdicion();
                elemento('tarjeta-vinculo').hidden = true;
                avisar(resultado.mensaje, true);
                await cargar();
            }, cliente.activo));
            if (cliente.activo && !cliente.vinculado)
                grupo.append(boton('Vincular cuenta', () => {
                    if (vinculo.getAttribute('aria-busy') === 'true')
                        return;
                    vinculo.reset();
                    (vinculo.elements.namedItem('clienteId') as HTMLInputElement).value = cliente.id;
                    (vinculo.elements.namedItem('correoCuenta') as HTMLInputElement).value = cliente.email;
                    elemento('cliente-elegido').textContent = nombreCompleto(cliente) + ' · DNI ' + cliente.dni;
                    elemento('tarjeta-vinculo').hidden = false;
                    elemento('tarjeta-vinculo').scrollIntoView({ block: 'start' });
                }));
        }
        if (administrador && !cliente.activo) grupo.append(boton('Eliminar definitivamente', async () => {
            if (!await confirmar('Se eliminarán para siempre la ficha de ' + nombreCompleto(cliente) + ', su historia clínica, rutinas, pagos y asignaciones. La cuenta web se conservará y quedará desvinculada. No podrás recuperar estos datos.', 'Eliminar cliente definitivamente')) return;
            const r = await api('/api/eliminar', { entidad: 'clientes', id: cliente.id, confirmado: true }); cancelarEdicion(); await cargar(); avisar(r.mensaje, true);
        }, true));
        return [nombreCompleto(cliente), cliente.dni, [cliente.telefono, cliente.email].filter(Boolean).join(' · ') || 'Sin contacto', cliente.activo ? 'Activo' : 'Inactivo', cliente.vinculado ? 'Vinculada' : 'Sin cuenta', grupo];
    }));
}
async function cargar(): Promise<void> { clientes = (await api<{
    clientes: ClienteListado[];
}>('/api/clientes')).clientes; mostrar(); }
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Clientes');
    if (!usuario)
        return;
    administrador = usuario.rol === 'ADMIN';
    elemento('tarjeta-alta').hidden = !administrador;
    manejarFormulario('formulario-cliente', async (datos) => {
        const resultado = await api(datos.clienteId ? '/api/clientes/editar' : '/api/clientes', datos);
        cancelarEdicion();
        await cargar();
        return resultado.mensaje;
    });
    manejarFormulario('formulario-vinculo', async (datos) => {
        const resultado = await api('/api/clientes/vincular', { ...datos, confirmado: datos.confirmado === 'on' });
        vinculo.reset();
        elemento('tarjeta-vinculo').hidden = true;
        await cargar();
        avisar(resultado.mensaje, true);
        return resultado.mensaje;
    });
    elemento('buscar').addEventListener('input', mostrar);
    elemento('filtro-estado').addEventListener('change', mostrar);
    elemento('cancelar-edicion').addEventListener('click', cancelarEdicion);
    elemento('actualizar').addEventListener('click', () => { void cargar().catch(avisar); });
    await cargar();
}
void iniciar().catch(avisar);
