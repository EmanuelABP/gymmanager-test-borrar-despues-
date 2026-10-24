export interface Ejercicio {
    _id: string;
    codigo: string;
    nombre: string;
    descripcion: string;
    grupoMuscular: string;
    activo: boolean;
}
export interface EjercicioRutina {
    ejercicioId: string;
    nombre: string;
    series: number;
    repeticiones: number;
    peso: number;
    descanso: number;
    orden: number;
    observaciones: string;
}
export interface Rutina {
    entrenadorId?: string;
    version?: number;
    _id?: string;
    fechaAsignacion: string;
    activo: boolean;
    observaciones: string;
    ejercicios: EjercicioRutina[];
}
export interface Historia {
    antecedentes: string;
    lesiones: string;
    observaciones: string;
    fechaActualizacion: string;
}
export interface Ficha {
    _id: string;
    nombre: string;
    apellido: string;
    dni: string;
    telefono?: string;
    email?: string;
    direccion?: string;
    fechaNacimiento?: string;
    fechaCreacion: string;
    activo: boolean;
    rutinas: Rutina[];
    usuarioId?: string;
    contactoEmergencia?: {
        nombre: string;
        telefono: string;
        relacion: string;
    };
    historiaClinica?: Historia;
}
export interface ClienteListado {
    id: string;
    nombre: string;
    apellido: string;
    dni: string;
    telefono: string;
    email: string;
    activo: boolean;
    vinculado: boolean;
}
export interface Personal {
    esEntrenador?: boolean;
    _id: string;
    nombre: string;
    apellido: string;
    rol: string;
}
export interface Turno {
    _id: string;
    dia: string;
    horaInicio: string;
    horaFin: string;
    capacidad: number;
    entrenadorId: string;
    entrenador: string;
    clientes: string[];
    activo: boolean;
    ocupacion: number;
    integrantes: Ficha[];
    observaciones?: string;
}
export interface Pago {
    _id: string;
    clienteId: string;
    cliente?: Ficha;
    tipo: string;
    monto: string;
    fechaPago: string;
    fechaVencimiento: string;
    estado: string;
    cobrado?: boolean;
    observaciones: string;
}
export interface Cuenta extends Personal {
    email: string;
    activo: boolean;
    clienteId?: string;
}
