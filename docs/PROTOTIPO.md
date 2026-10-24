# GymManager — Primer prototipo

Implementación local con HTML, CSS y TypeScript; backend Node.js y MongoDB Atlas. Se conservó el registro/login existente y se completaron los módulos del MVP para un único gimnasio.

## Ejecutar

Se requiere Node.js 24 o posterior. Desde la raíz:

```bash
npm install
npm run dev
```

En otra terminal:

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

**Si ya existe backend/.env, conservarlo: no copiar la plantilla encima.** Configurar MONGODB_URI y MONGODB_DB en ese archivo privado. La base actual es gym_manager. Nunca usar variables VITE_ para credenciales de Atlas. Vite muestra la dirección del frontend y envía /api al backend en localhost:3000.

## Primer administrador

Si ya tenés un administrador, usá esa cuenta. Para una instalación sin administradores activos, completar temporalmente ADMIN_EMAIL, ADMIN_NOMBRE, ADMIN_APELLIDO y ADMIN_PASSWORD en backend/.env. Desde backend ejecutar:

```bash
npm run crear:admin
```

El comando crea la cuenta solo al ejecutarlo explícitamente y rechaza el alta si ya existe un administrador activo o el correo está registrado. Después quitar ADMIN_PASSWORD del archivo. El servidor no crea cuentas ni carga datos de ejemplo al arrancar. Los entrenadores y administradores adicionales se crean desde Cuentas; los clientes se registran en la web.

## Pantallas y permisos

| Función | ADMIN | ENTRENADOR | USUARIO |
|---|---|---|---|
| Inicio | Indicadores, ingresos y alertas | Sus turnos y accesos de trabajo | Su perfil |
| Clientes | Alta, edición, baja, reactivación y vinculación | Consulta y acceso a rutinas/historia | Solo su ficha vinculada |
| Ejercicios | Alta, edición, baja y reactivación | Consulta del catálogo | Solo los de su rutina |
| Rutinas | Asignación, historial e impresión | Asignación, historial e impresión | Consulta e impresión de la vigente |
| Turnos | Crear, editar, desactivar y asignar/retirar clientes | Crear, editar, desactivar y asignar/retirar clientes | Consulta de sus asignaciones |
| Historia clínica | Consulta y edición | Consulta y edición | Solo la propia |
| Pagos y reportes | Registro, cobro, renovación y consulta | Sin acceso | Sin acceso |
| Cuentas | Crear personal; cambiar rol/estado de cuentas | Sin acceso | Sin acceso |
| Mi cuenta | Cambiar contraseña | Cambiar contraseña | Cambiar contraseña |

Las páginas verifican sesión antes de mostrar su contenido. Una URL de un apartado no autorizado redirige al destino del rol. El backend comprueba también los permisos y devuelve 401/403; ocultar un botón no es la protección. Al volver con Atrás a una página protegida se comprueba nuevamente la sesión.

Los roles se muestran como ADMIN, USUARIO y ENTRENADOR. Se puede cambiar el rol aunque exista una ficha vinculada: el vínculo se conserva y el destino de la cuenta cambia según el nuevo rol. No se permite quitarse el acceso ADMIN desde la propia cuenta ni dejar al sistema sin administradores activos. ADMIN puede activar la función adicional esEntrenador para figurar como responsable de entrenamiento; se mantiene el campo rol compatible con el validador actual. Cambiar permisos de otra cuenta cierra sus sesiones. El entrenador queda identificado como autor de las rutinas que asigna; administración elige el responsable.

## Recorrido sugerido

1. Iniciar sesión como administrador y crear una cuenta ENTRENADOR desde Cuentas.
2. Crear una ficha en Clientes, con o sin teléfono y correo. Probar Editar para completarlos después.
3. Registrar una cuenta de cliente desde otra sesión/navegador. Volver como ADMIN y vincularla a la ficha, comprobando la identidad.
4. Crear ejercicios en el catálogo.
5. Entrar como entrenador, elegir la ficha y asignar una rutina. Agregar los ejercicios y sus cantidades.
6. Crear un turno semanal, definir responsable y cupo, y asignar al cliente.
7. Como cliente, consultar su perfil y cargar antecedentes, lesiones u observaciones en Historia clínica.
8. Como ADMIN, registrar una cuota y revisar el inicio y Pagos. Una renovación crea un registro nuevo.
9. Probar la baja lógica y la reactivación de la ficha. Verificar que el historial se conserva.

## Reglas implementadas

- El registro público crea también una sesión y redirige al perfil, pero no crea automáticamente una ficha ni un socio activo. La vinculación usuario-cliente se hace en una transacción y conserva la relación uno a uno. Se omiten las referencias opcionales hasta vincularlas, por sus índices únicos sparse.
- Correo de contacto y correo de acceso son independientes. Editar la ficha no modifica las credenciales del usuario.
- Nombre, apellido y DNI son obligatorios. El DNI admite siete u ocho dígitos y se normalizan sus separadores. Teléfono, correo, nacimiento, dirección y contacto de emergencia son opcionales.
- Baja lógica: activo=false, fechaBaja y fechaModificacion. No se borran ficha, rutinas, pagos ni historia clínica. Se liberan sus cupos y se registra el movimiento en turnos.historialClientes. Reactivar no reinscribe automáticamente. La cuenta vinculada conserva su acceso para consultar su información; su bloqueo se administra por separado desde Cuentas.
- Las fichas inactivas permiten consultar su historia clínica, pero no modificarla ni recibir rutinas o nuevas asignaciones.
- La rutina vigente se puede editar conservando identidad e historial, con control de versión para no sobrescribir una edición simultánea. Los ejercicios del borrador se resumen en filas con Modificar/Quitar, y el historial está separado. Cada asignación de rutina nueva usa una actualización atómica: desactiva la anterior y conserva como máximo doce, descartando la inactiva más antigua. El orden de las filas define el orden de los ejercicios. Series, repeticiones, descanso y orden se almacenan como enteros BSON.
- Los ejercicios se dan de baja lógicamente y siguen disponibles para consultar rutinas anteriores. Un código de ejercicio y un DNI siguen reservados aunque el registro esté inactivo.
- Turnos recurrentes semanales de una hora, sin superposiciones por entrenador y con cupo entero positivo definido por administración, sin máximo fijo de cinco. ADMIN configura franjas de apertura y días de trabajo de cada entrenador para generarlos en lote; la configuración queda en configuracion. Repetir la generación conserva los turnos coincidentes y sus asignaciones. Los bloques anteriores de varias horas no se convierten ni eliminan automáticamente: se informa el conflicto para que administración los revise. El cupo se comprueba dentro de la escritura y la asignación usa una transacción. No se admiten duplicados. Editar no permite reducir el cupo por debajo de la ocupación actual.
- Historia clínica opcional, de texto: antecedentes, lesiones, observaciones y fecha de actualización. Los listados generales no incluyen información clínica. Un cliente solo puede consultar/modificar su propia historia; se verifican las dos referencias de la vinculación.
- Pagos: Decimal128 creado desde texto para el monto. Las sumas se calculan en centavos enteros. Se registra el usuario responsable. Los campos adicionales cobrado y usuarioCobroId distinguen el dinero recibido de la vigencia de la cuota y auditan cobros posteriores.
- Criterio de cuotas elegido para resolver los borradores: la cuota con vencimiento más lejano representa la vigencia actual; en un empate se prioriza la fecha de pago y el identificador. Al vencer pasa a VENCIDO, incluso si ya fue cobrada; cobrado conserva ese dato y no se vuelve a cobrar. Una renovación vigente evita tratar una cuota anterior como deuda actual. La inscripción inicia ahora el ciclo de cuotas de 30 días; ver la política actualizada al final de esta guía.
- Los ingresos del mes suman cobros de inscripción/cuota realizados en el mes argentino, incluso si su vigencia ya terminó. Excluyen pendientes de cobro. Los datos históricos sin cobrado solo se consideran cobrados si su estado es PAGADO; revisar cualquier dato importado cuyo cobro no pueda deducirse.
- Vencimientos comprobados al consultar pagos/reportes y cada minuto mientras el backend está encendido. Próximos a vencer: siete días. Clientes sin cuota tienen un listado separado. Son indicadores internos; no se envían avisos externos.
- Fechas de auditoría en UTC. Fechas de calendario y visualización en America/Argentina/Buenos_Aires. Los vencimientos automáticos se calculan a partir de fechas de calendario argentinas, con intervalos exactos de 30 días. El estado de cliente activo depende de clientes.activo, no de su último pago.
- Sesión mediante cookie HttpOnly y token aleatorio cuyo hash se almacena en sesiones, con vencimiento explícito. Cambiar contraseña comprueba la actual, actualiza su hash, rota la cookie de la sesión actual y cierra las anteriores. La sesión de quien hace el cambio continúa abierta. Se indica el mínimo de ocho caracteres y el máximo de 72 bytes junto al formulario, con errores específicos.

## Comprobaciones

Desde la raíz:

```bash
npm run build
npm test
```

Desde backend:

```bash
npm run check
npm run build
npm test
```

Las pruebas de backend usan un doble de MongoDB en memoria y no crean registros en Atlas. Cubren permisos de los tres roles, acceso clínico propio, fichas y bajas, cupos, rutinas, pagos, estados de sesión y cambio de contraseña.

La comprobación opcional siguiente **solo lee Atlas**: consulta validadores y evalúa expresiones sobre documentos ficticios con $documents, sin insertarlos:

```bash
cd backend
node --env-file-if-exists=.env tests/comprobar-expresiones-atlas.ts
```

Para una demostración aislada con datos ficticios, primero compilar la web y luego ejecutar desde backend:

```bash
node tests/servidor-demo.ts
```

Abrir http://127.0.0.1:3199/__pruebas/rol/ADMIN, /__pruebas/rol/ENTRENADOR o /__pruebas/rol/USUARIO. Los datos viven solo en memoria y se pierden al detener ese servidor. No comparte cuentas ni sesiones con la aplicación real. Este servidor no debe desplegarse ni usarse como autenticación real.

## Compilación para un servidor

El build de Vite incluye todas las páginas HTML. Después de compilar la raíz y backend, desde backend se puede ejecutar npm start: el servidor atiende la API y la carpeta dist de la web desde el mismo origen. No requiere Vite para servir el resultado compilado.

Para publicar: configurar HTTPS con el alojamiento elegido y NODE_ENV=production para la cookie Secure. No se realizó ningún despliegue ni vinculación con GitHub en este avance.

## Alcance que queda para después

La especificación funcional final del ZIP excluye Google, recuperación por correo, notificaciones externas, pagos en línea, facturación, archivos médicos adjuntos, reservas puntuales, IA y múltiples gimnasios. No se añadieron a este MVP. Un usuario puede cambiar su contraseña mientras tenga acceso; recuperar una contraseña olvidada por email queda fuera de esta entrega.

Pendiente documental de la entrega: alinear los MD originales con Node.js, la sesión por cookie y las decisiones de permisos, cuotas e ingresos de esta guía. El ZIP original no se modificó. Los documentos internos contenían diferencias entre sí; esta tabla y las reglas anteriores describen el comportamiento concreto del prototipo.

Validación restante de uso: recorrer el circuito completo con las cuentas reales y datos elegidos por el usuario. Las pruebas aisladas y las consultas de validación en Atlas no equivalen a ejecutar todas las escrituras con datos reales.

## Cambios tras las pruebas del usuario (24/10/2026)

Las confirmaciones usan un dialogo de la propia web, con Cancelar, Confirmar y cierre por Escape. Los selectores de responsables incluyen solo ENTRENADOR y ADMIN con la función adicional habilitada.

En Pagos se muestra automáticamente Cuotas a cobrar: fichas activas sin cuota registrada, cuotas explícitas sin cobrar y renovaciones cuya vigencia terminó. No se crean pagos ficticios ni se inventan tarifas. Un registro público sin ficha no se considera inscripción al gimnasio. Registrar un cobro hace que se vuelva a calcular la lista. Los importes siguen definiéndose al cobrar. Los vencimientos son automáticos cada 30 días, sin edición manual.

La política vigente permite el cupo entero positivo que configure administración; ya no existe el máximo fijo de cinco. Los bloques anteriores conservan sus datos hasta ser revisados. Cambiar los días de la agenda no borra automáticamente turnos fuera de esa selección.

Las pruebas actualizadas cubren además registro con sesión, rotación al cambiar contraseña, cambio de rol sin perder ficha, responsables de entrenamiento, edición de rutina con control de versión, generación idempotente de horarios y pendientes automáticos.


## Ajustes de agenda, Excel y ciclos de cuotas (24/10/2026)

- ADMIN puede crear USUARIO, ENTRENADOR y ADMIN desde Cuentas. El alta USUARIO no crea una ficha automáticamente.
- Menú móvil con fondo y bordes celestes, opción activa diferenciada. Las tablas se desplazan dentro de su tarjeta.
- Agenda: elegir días comunes y seleccionar varios entrenadores dentro de un desplegable con casillas. Cada generación aplica esos días y franjas a los entrenadores seleccionados. Se pueden hacer varias generaciones para distintos grupos de trabajo; no se eliminan turnos fuera de la selección. Cupo sin tope de cinco, conservando validación de entero positivo y de ocupación existente.
- Para dar de baja todos los turnos de un entrenador: filtrar por entrenador, Seleccionar visibles y Dar de baja selección. También hay borrado definitivo de la selección con aviso irreversible, exclusivo de ADMIN.
- Catálogo: importación Excel .xlsx con ExcelJS (cargado solo al usar Excel), primera hoja, encabezados código/nombre/grupo muscular/descripción. Plantilla descargable, hasta 1000 filas y 2 MB por archivo, vista previa, filas inválidas y códigos duplicados omitidos. Los válidos se envían uno por uno, con validación y permisos en el servidor; se informa cuántos se cargaron y cada error. No reemplaza ejercicios existentes. El lote puede completarse parcialmente: reintentar con el archivo vuelve a omitir los códigos ya cargados.

### Qué guarda configuracion

La colección guarda un documento pequeño de agenda con franjas de apertura, capacidad y trabajos (entrenador y días). revisionAgenda es un contador que serializa cambios de turnos y cupos dentro de las transacciones. Otro documento coordina cambios de cuentas para proteger los permisos y la existencia de ADMIN. El borrado usa los mismos bloqueos. No contiene pagos, clientes duplicados ni credenciales. Si solo existe un contador, la consulta completa los ajustes con valores iniciales. No borrar esta colección: se perderían preferencias y coordinación de operaciones.

### Cuotas automáticas

Pagar INSCRIPCION inicia el primer vencimiento 30 días después. Cada CUOTA cobrada corresponde al siguiente vencimiento y cubre 30 días adicionales; se conserva el ancla aunque pague tarde. Ejemplo: inscripción 24/10/2026, cuota 1 vence 23/11/2026, cuota 2 el 23/12/2026. fechaVencimiento identifica el vencimiento de la cuota abonada y finVigencia el siguiente límite de cobertura. Pagos anteriores sin finVigencia mantienen su fechaVencimiento como referencia para el siguiente cobro, sin migración de los registros reales.

El Calendario de cuotas incluye únicamente clientes activos: muestra la siguiente cuota, distingue las futuras de las vencidas y cuenta cuántos intervalos de 30 días quedaron sin cubrir. No se insertan pagos ficticios por cada mes futuro ni se inventa un importe. Se cobra una cuota por vez y el calendario avanza al siguiente intervalo. El historial de pagos incluye los períodos anteriores.

La baja retira al cliente del calendario. La reactivación abre un nuevo ciclo mediante inicioCicloCuotas y cicloCuotasId: los pagos previos permanecen en el historial pero no generan deuda en el ciclo nuevo ni permiten cobrar pendientes de una etapa anterior. Se puede reiniciar con una inscripción o una cuota; si se inicia directamente con CUOTA, cubre 30 días desde ese pago. Los ingresos incluyen cobros reales de todas las etapas, y los reportes de deuda consideran solo el ciclo activo.

### Borrado definitivo

Es una última opción de ADMIN, con advertencia irreversible. Clientes, cuentas y ejercicios deben estar inactivos primero. Borrar un cliente elimina ficha, datos clínicos, rutinas, pagos y movimientos del turno; la cuenta se conserva desvinculada. Borrar una cuenta elimina sus sesiones y desvincula la ficha, sin borrar la ficha. Cuentas responsables de turnos, rutinas o pagos, y ejercicios referenciados por rutinas, no pueden borrarse: se explica por qué y se mantiene la baja lógica. No se ejecutaron borrados sobre Atlas durante las pruebas.
