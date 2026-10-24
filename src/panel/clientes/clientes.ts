import {
  exigirSesion,
  cerrarSesion,
  redirigirSegunRol,
} from '../../compartidos/sesion.ts'

interface Cliente {
  id: string
  nombre: string
  apellido: string
  dni: string
  telefono: string
  email: string
  activo: boolean
  vinculado: boolean
}

interface RespuestaAPI {
  mensaje?: string
  campos?: string[]
  clientes?: unknown[]
}

class ErrorAPI extends Error {
  campos: string[]

  constructor(mensaje: string, campos: string[] = []) {
    super(mensaje)
    this.campos = campos
  }
}

// Obtiene un elemento y evita continuar si falta en el HTML.
function elemento<T extends HTMLElement>(id: string): T {
  const encontrado = document.getElementById(id)
  if (!encontrado) throw new Error(`No se encontró ${id}.`)
  return encontrado as T
}

const mensajePanel = elemento<HTMLParagraphElement>('mensaje-panel')
const modulo = elemento<HTMLDivElement>('modulo-clientes')
const seccionAlta = elemento<HTMLElement>('seccion-alta')
const seccionVinculo = elemento<HTMLElement>('seccion-vinculo')

const formularioAlta = elemento<HTMLFormElement>('formulario-cliente')
const formularioVinculo = elemento<HTMLFormElement>('formulario-vinculo')

const mensajeAlta = elemento<HTMLParagraphElement>('mensaje-alta')
const mensajeVinculo = elemento<HTMLParagraphElement>('mensaje-vinculo')
const mensajeListado = elemento<HTMLParagraphElement>('mensaje-listado')

const filas = elemento<HTMLTableSectionElement>('filas-clientes')
const botonActualizar = elemento<HTMLButtonElement>('actualizar-clientes')
const botonCerrar = elemento<HTMLButtonElement>('boton-cerrar-sesion')

let esAdministrador = false
let guardandoAlta = false
let guardandoVinculo = false

// Envía solicitudes usando la cookie de sesión.
async function solicitarAPI(
  ruta: string,
  opciones: RequestInit = {}
): Promise<RespuestaAPI> {
  const respuesta = await fetch(ruta, {
    ...opciones,
    credentials: 'include',
    cache: 'no-store',
  })

  if (respuesta.status === 401) {
    window.location.replace('/src/auth/login/login.html')
    throw new ErrorAPI('Tu sesión terminó. Iniciá sesión nuevamente.')
  }

  const contenido: unknown = await respuesta.json()

  if (
    !contenido ||
    typeof contenido !== 'object' ||
    Array.isArray(contenido)
  ) {
    throw new ErrorAPI('El servidor devolvió una respuesta inesperada.')
  }

  const datos = contenido as Record<string, unknown>

  if (!respuesta.ok) {
    const campos =
      Array.isArray(datos.campos) &&
      datos.campos.every(campo => typeof campo === 'string')
        ? datos.campos as string[]
        : []

    throw new ErrorAPI(
      typeof datos.mensaje === 'string'
        ? datos.mensaje
        : 'No pudimos completar la operación.',
      campos
    )
  }

  return contenido as RespuestaAPI
}

function valor(formulario: HTMLFormElement, nombre: string): string {
  return String(new FormData(formulario).get(nombre) ?? '').trim()
}

function limpiarErrores(
  formulario: HTMLFormElement,
  mensaje: HTMLElement
): void {
  mensaje.textContent = ''
  mensaje.dataset.estado = 'error'

  for (const campo of formulario.querySelectorAll('[aria-invalid]')) {
    campo.removeAttribute('aria-invalid')
    campo.removeAttribute('aria-describedby')
  }
}

function mostrarError(
  formulario: HTMLFormElement,
  mensaje: HTMLElement,
  error: unknown
): void {
  mensaje.dataset.estado = 'error'
  mensaje.textContent = error instanceof Error
    ? error.message
    : 'No pudimos completar la operación.'

  if (!(error instanceof ErrorAPI)) return

  let primero: HTMLInputElement | undefined

  for (const nombre of error.campos) {
    const campo = formulario.elements.namedItem(nombre)

    if (campo instanceof HTMLInputElement) {
      campo.setAttribute('aria-invalid', 'true')
      campo.setAttribute('aria-describedby', mensaje.id)
      primero ??= campo
    }
  }

  primero?.focus()
}

function bloquear(formulario: HTMLFormElement, estado: boolean): void {
  const grupo = formulario.querySelector('fieldset')
  if (grupo) grupo.disabled = estado
}

// Retiramos la marca del campo mientras se corrige.
for (const [formulario, mensaje] of [
  [formularioAlta, mensajeAlta],
  [formularioVinculo, mensajeVinculo],
] as const) {
  formulario.addEventListener('input', evento => {
    const campo = evento.target

    if (campo instanceof HTMLInputElement) {
      campo.removeAttribute('aria-invalid')
      campo.removeAttribute('aria-describedby')
    }

    if (!formulario.querySelector('[aria-invalid="true"]')) {
      mensaje.textContent = ''
    }
  })
}

// Comprobamos los campos utilizados para dibujar una fila.
function esCliente(valor: unknown): valor is Cliente {
  if (!valor || typeof valor !== 'object') return false

  const cliente = valor as Record<string, unknown>

  return (
    ['id', 'nombre', 'apellido', 'dni', 'telefono', 'email']
      .every(campo => typeof cliente[campo] === 'string') &&
    typeof cliente.activo === 'boolean' &&
    typeof cliente.vinculado === 'boolean'
  )
}

function abrirVinculacion(cliente: Cliente): void {
  formularioVinculo.reset()
  limpiarErrores(formularioVinculo, mensajeVinculo)

  const id = formularioVinculo.elements.namedItem('clienteId')
  const correo = formularioVinculo.elements.namedItem('correoCuenta')

  if (!(id instanceof HTMLInputElement)) return
  if (!(correo instanceof HTMLInputElement)) return

  id.value = cliente.id
  correo.value = cliente.email

  elemento<HTMLElement>('cliente-elegido').textContent =
    `${cliente.nombre} ${cliente.apellido} · DNI ${cliente.dni}`

  seccionVinculo.hidden = false
  seccionVinculo.scrollIntoView({ block: 'start' })
  correo.focus()
}

function mostrarClientes(clientes: Cliente[]): void {
  filas.replaceChildren()

  if (clientes.length === 0) {
    const fila = document.createElement('tr')
    const celda = document.createElement('td')

    celda.colSpan = 6
    celda.textContent = 'Todavía no hay clientes registrados.'
    fila.append(celda)
    filas.append(fila)
    return
  }

  for (const cliente of clientes) {
    const fila = document.createElement('tr')

    const valores = [
      `${cliente.apellido}, ${cliente.nombre}`,
      cliente.dni,
      [cliente.telefono, cliente.email].filter(Boolean).join(' · ') || '—',
      cliente.activo ? 'Activo' : 'Inactivo',
      cliente.vinculado ? 'Vinculada' : 'Sin cuenta',
    ]

    // Usamos textContent: los datos nunca se interpretan como HTML.
    for (const texto of valores) {
      const celda = document.createElement('td')
      celda.textContent = texto
      fila.append(celda)
    }

    const acciones = document.createElement('td')

    if (esAdministrador && cliente.activo && !cliente.vinculado) {
      const boton = document.createElement('button')
      boton.type = 'button'
      boton.className = 'boton-clientes secundario'
      boton.textContent = 'Vincular cuenta'
      boton.addEventListener('click', () => abrirVinculacion(cliente))
      acciones.append(boton)
    } else {
      acciones.textContent = '—'
    }

    fila.append(acciones)
    filas.append(fila)
  }
}

async function cargarClientes(): Promise<void> {
  botonActualizar.disabled = true
  mensajeListado.textContent = 'Cargando clientes…'

  try {
    const resultado = await solicitarAPI('/api/clientes')

    if (
      !Array.isArray(resultado.clientes) ||
      !resultado.clientes.every(esCliente)
    ) {
      throw new ErrorAPI('El listado recibido no tiene el formato esperado.')
    }

    mostrarClientes(resultado.clientes)
    mensajeListado.textContent = ''
  } catch (error) {
    mensajeListado.textContent = error instanceof Error
      ? error.message
      : 'No pudimos cargar el listado.'
  } finally {
    botonActualizar.disabled = false
  }
}

// Alta de una ficha.
formularioAlta.addEventListener('submit', async evento => {
  evento.preventDefault()
  if (!esAdministrador || guardandoAlta) return

  limpiarErrores(formularioAlta, mensajeAlta)

  const datos = {
    nombre: valor(formularioAlta, 'nombre'),
    apellido: valor(formularioAlta, 'apellido'),
    dni: valor(formularioAlta, 'dni').replace(/[.\s-]/g, ''),
    telefono: valor(formularioAlta, 'telefono'),
    email: valor(formularioAlta, 'email'),
  }

  const faltantes = (['nombre', 'apellido', 'dni'] as const)
    .filter(campo => !datos[campo])

  if (faltantes.length) {
    mostrarError(
      formularioAlta,
      mensajeAlta,
      new ErrorAPI('Completá los campos marcados.', faltantes)
    )
    return
  }

  if (!/^\d{7,8}$/.test(datos.dni)) {
    mostrarError(
      formularioAlta,
      mensajeAlta,
      new ErrorAPI('Ingresá un DNI de siete u ocho dígitos.', ['dni'])
    )
    return
  }

  if (datos.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.email)) {
    mostrarError(
      formularioAlta,
      mensajeAlta,
      new ErrorAPI('Ingresá un correo de contacto válido.', ['email'])
    )
    return
  }

  guardandoAlta = true
  bloquear(formularioAlta, true)

  try {
    const resultado = await solicitarAPI('/api/clientes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })

    formularioAlta.reset()
    mensajeAlta.dataset.estado = 'exito'
    mensajeAlta.textContent = resultado.mensaje ?? 'Cliente creado correctamente.'

    await cargarClientes()
  } catch (error) {
    // Habilitamos los campos antes de enfocar el que tenga error.
    bloquear(formularioAlta, false)
    mostrarError(formularioAlta, mensajeAlta, error)
  } finally {
    guardandoAlta = false
    bloquear(formularioAlta, false)
  }
})

// Vinculación con una cuenta registrada.
formularioVinculo.addEventListener('submit', async evento => {
  evento.preventDefault()
  if (!esAdministrador || guardandoVinculo) return

  limpiarErrores(formularioVinculo, mensajeVinculo)

  const confirmacion = formularioVinculo.elements.namedItem('confirmado')

  const datos = {
    clienteId: valor(formularioVinculo, 'clienteId'),
    correoCuenta: valor(formularioVinculo, 'correoCuenta'),
    confirmado:
      confirmacion instanceof HTMLInputElement && confirmacion.checked,
  }

  const incorrectos: string[] = []

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datos.correoCuenta)) {
    incorrectos.push('correoCuenta')
  }

  if (!datos.confirmado) incorrectos.push('confirmado')

  if (incorrectos.length) {
    mostrarError(
      formularioVinculo,
      mensajeVinculo,
      new ErrorAPI(
        'Ingresá un correo válido y confirmá que verificaste la cuenta.',
        incorrectos
      )
    )
    return
  }

  guardandoVinculo = true
  bloquear(formularioVinculo, true)

  try {
    const resultado = await solicitarAPI('/api/clientes/vincular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos),
    })

    seccionVinculo.hidden = true
    formularioVinculo.reset()

    mensajePanel.dataset.estado = 'exito'
    mensajePanel.textContent =
      resultado.mensaje ?? 'Cuenta vinculada correctamente.'

    await cargarClientes()
  } catch (error) {
    bloquear(formularioVinculo, false)
    mostrarError(formularioVinculo, mensajeVinculo, error)
  } finally {
    guardandoVinculo = false
    bloquear(formularioVinculo, false)
  }
})

elemento<HTMLButtonElement>('cancelar-vinculo')
  .addEventListener('click', () => {
    seccionVinculo.hidden = true
    formularioVinculo.reset()
  })

botonActualizar.addEventListener('click', () => {
  void cargarClientes()
})

botonCerrar.addEventListener('click', async () => {
  botonCerrar.disabled = true

  try {
    await cerrarSesion()
  } catch {
    mensajePanel.dataset.estado = 'error'
    mensajePanel.textContent = 'No pudimos cerrar la sesión. Intentá nuevamente.'
    botonCerrar.disabled = false
  }
})

// Inicialización y permisos de la pantalla.
async function iniciarClientes(): Promise<void> {
  try {
    const usuario = await exigirSesion()
    if (!usuario) return

    if (usuario.rol === 'USUARIO') {
      redirigirSegunRol(usuario)
      return
    }

    esAdministrador = usuario.rol === 'ADMIN'

    elemento<HTMLElement>('nombre-personal').textContent =
      `${usuario.nombre} ${usuario.apellido}`

    elemento<HTMLElement>('rol-personal').textContent =
      esAdministrador ? 'Administrador' : 'Entrenador'

    for (const opcion of document.querySelectorAll<HTMLElement>(
      '[data-solo-admin]'
    )) {
      opcion.hidden = !esAdministrador
    }

    seccionAlta.hidden = !esAdministrador
    modulo.hidden = false
    botonCerrar.disabled = false
    mensajePanel.textContent = ''

    await cargarClientes()
  } catch {
    mensajePanel.dataset.estado = 'error'
    mensajePanel.textContent =
      'No pudimos cargar la pantalla. Recargá para intentar nuevamente.'
  }
}

void iniciarClientes()