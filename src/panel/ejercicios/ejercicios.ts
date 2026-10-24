import { confirmar } from '../../compartidos/dialogo.ts'
import { prepararPanel } from '../estructura.ts';
import { api, elemento, manejarFormulario, tabla, boton, acciones, avisar } from '../../compartidos/api.ts';
import type { Ejercicio } from '../../compartidos/modelos.ts';
let ejercicios: Ejercicio[] = [];
let administrador = false;
const formulario = elemento<HTMLFormElement>('formulario-ejercicio');
function mostrar(): void {
    const buscar = elemento<HTMLInputElement>('buscar').value.toLowerCase();
    tabla(elemento('listado'), ['Código', 'Ejercicio', 'Grupo muscular', 'Descripción', 'Estado', 'Acciones'], ejercicios.filter(e => [e.codigo, e.nombre, e.grupoMuscular].join(' ').toLowerCase().includes(buscar)).map(e => [e.codigo, e.nombre, e.grupoMuscular, e.descripcion || '—', e.activo ? 'Activo' : 'Inactivo', administrador ? acciones(boton('Editar', () => {
            if (formulario.getAttribute('aria-busy') === 'true')
                return;
            for (const nombre of ['codigo', 'nombre', 'grupoMuscular', 'descripcion'] as const)
                (formulario.elements.namedItem(nombre) as HTMLInputElement).value = e[nombre] ?? '';
            (formulario.elements.namedItem('id') as HTMLInputElement).value = e._id;
            formulario.scrollIntoView({ block: 'start' });
        }), boton(e.activo ? 'Dar de baja' : 'Reactivar', async () => {
            if (!await confirmar('¿Cambiar el estado de ' + e.nombre + '?'))
                return;
            const resultado = await api('/api/ejercicios/estado', { id: e._id, activo: !e.activo });
            await cargar();
            avisar(resultado.mensaje, true);
        }, e.activo)) : 'Solo consulta']));
}
async function cargar(): Promise<void> { ejercicios = (await api<{
    ejercicios: Ejercicio[];
}>('/api/ejercicios')).ejercicios; mostrar(); }
async function iniciar(): Promise<void> {
    const usuario = await prepararPanel('Ejercicios');
    if (!usuario)
        return;
    administrador = usuario.rol === 'ADMIN';
    elemento('tarjeta-editor').hidden = !administrador;
    manejarFormulario('formulario-ejercicio', async (datos, form) => { const r = await api('/api/ejercicios', datos); form.reset(); await cargar(); return r.mensaje; });
    elemento('buscar').addEventListener('input', mostrar);
    await cargar();
}
void iniciar().catch(avisar);
