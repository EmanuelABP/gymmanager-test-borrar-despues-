import { Decimal128, ObjectId } from 'mongodb'
export const id = (numero: number) => new ObjectId(numero.toString(16).padStart(24, '0'))
export const usuarios = [
  { _id: id(1), nombre: 'Ana', apellido: 'Administradora', email: 'admin@example.test', rol: 'ADMIN', activo: true },
  { _id: id(2), nombre: 'Luis', apellido: 'Entrenador', email: 'entrenador@example.test', rol: 'ENTRENADOR', activo: true },
  { _id: id(3), nombre: 'Sofía', apellido: 'Cliente', email: 'cliente@example.test', rol: 'USUARIO', activo: true, clienteId: id(11) },
]
export function semilla() {
  return {
    usuarios,
    clientes: [
      { _id: id(11), usuarioId: id(3), nombre: 'Sofía', apellido: 'Cliente', dni: '40111222', activo: true, fechaCreacion: new Date('2026-01-01T03:00:00Z'), fechaModificacion: new Date(), rutinas: [], historiaClinica: { antecedentes: 'Sin antecedentes declarados', lesiones: '', observaciones: '', fechaActualizacion: new Date() } },
      { _id: id(12), nombre: 'Pedro', apellido: 'Gómez', dni: '35222333', activo: true, fechaCreacion: new Date(), fechaModificacion: new Date(), rutinas: [] },
    ],
    ejercicios: [{ _id: id(31), codigo: 'EJ-001', nombre: 'Sentadilla', grupoMuscular: 'Piernas', descripcion: 'Mantener la espalda alineada.', activo: true, fechaCreacion: new Date(), fechaModificacion: new Date() }],
    turnos: [{ _id: id(41), dia: 'LUNES', horaInicio: '18:00', horaFin: '19:00', capacidad: 2, entrenadorId: id(2), activo: true, clientes: [id(11)], observaciones: 'Entrenamiento general' }],
    pagos: [{ _id: id(51), clienteId: id(11), tipo: 'CUOTA', monto: Decimal128.fromString('25000.00'), fechaPago: new Date(), fechaVencimiento: new Date(Date.now() + 3 * 86_400_000), estado: 'PAGADO', cobrado: true, usuarioRegistroId: id(1), observaciones: '' }],
  }
}
export function usuarioSesion(rol: string) {
  const usuario = usuarios.find(u => u.rol === rol)!
  return { id: usuario._id.toHexString(), nombre: usuario.nombre, apellido: usuario.apellido, email: usuario.email, rol: usuario.rol, clienteId: usuario.clienteId?.toHexString() ?? null }
}
