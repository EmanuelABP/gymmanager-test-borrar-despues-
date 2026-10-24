# GymManager — Bitácora de desarrollo

Proyecto web de gestión de gimnasio desarrollado como parte del Trabajo Final Integrador.

## Acuerdo de trabajo con el asistente

- El usuario crea e incorpora el código del proyecto. El asistente puede leer los archivos para responder con contexto y enviar propuestas de código por el chat.
- El asistente no debe crear, modificar ni eliminar otros archivos del proyecto sin autorización del usuario.
- El asistente debe actualizar este `README.md` con cada avance confirmado, manteniendo una bitácora de los pasos realizados.
- El usuario autorizó como excepción puntual la creación del backend inicial, su reemplazo por Node.js/TypeScript y la configuración de conexión con MongoDB Atlas. Esta autorización no habilita cambios generales posteriores en el código.
- El usuario autorizó otra excepción puntual: mejorar los indicadores de error del registro y extraer sus estilos compartidos a `src/auth/auth.css`. El resto del trabajo sigue sujeto al acuerdo de lectura y propuestas por chat.
- Registrar únicamente pasos confirmados por el usuario o comprobados en los archivos. Las propuestas y tareas pendientes no deben figurar como completadas.
- Leer este acuerdo antes de continuar el trabajo en futuras sesiones.

## Tecnologías del frontend

- HTML para la estructura.
- CSS para los estilos.
- TypeScript para la lógica.
- Vite como herramienta de desarrollo y compilación.

## Avances

### 1. Preparación del control de versiones

Se creó un repositorio Git local para registrar los avances mediante commits.

Se eligió `borrador-web` como nombre de la rama de trabajo secundaria. La vinculación con el repositorio de GitHub de la entrega queda para más adelante.

### 2. Creación del proyecto web con Vite

Se creó el proyecto en la carpeta `TF Gimmanager` usando la plantilla `vanilla-ts`, para trabajar con HTML, CSS y TypeScript.

Comando utilizado desde la carpeta del proyecto:

```powershell
npm create vite@latest . -- --template vanilla-ts
```

El punto (`.`) indica que el proyecto se crea directamente en la carpeta actual.

### 3. Creación de esta bitácora

Se creó este README en la carpeta del proyecto con autorización del usuario para conservar y actualizar el registro de avances.

### 4. Limpieza de la plantilla de Vite

Se eliminaron el contador, las imágenes, los íconos y el contenido de demostración de la plantilla.

- `src/main.ts` conserva únicamente la importación de `style.css`.
- `src/style.css` quedó vacío para comenzar los estilos propios.
- `index.html` conserva la estructura inicial, con idioma español y título `GymManager`, sin el favicon de ejemplo.

La limpieza se verificó leyendo los archivos del proyecto.

### 5. Preparación y cambio de tecnología del backend

Inicialmente se generó un backend Java con Spring Boot. Luego, el usuario decidió reemplazarlo por Node.js, siguiendo el enfoque aprendido en Base de Datos 2: usar la librería oficial `mongodb` y un `MongoClient` compartido.

Se retiraron el código Java, Maven y los archivos generados de esa implementación inicial. El backend actual utiliza Node.js y TypeScript. El frontend Vite permanece sin cambios.

Se crearon:

- `backend/src/db.ts`: centraliza el acceso a MongoDB y reutiliza un único cliente dentro de cada proceso.
- `backend/src/check-connection.ts`: comprueba la conexión mediante un `ping` y luego cierra el cliente, sin insertar ni modificar datos.
- `backend/src/server.ts`: servidor HTTP inicial, con una ruta `GET /api/salud`. Se inicia solamente si primero consigue conectarse y ejecutar un `ping` en MongoDB.
- `backend/.env.example`: nombres de las variables necesarias, sin credenciales reales.
- Configuración de TypeScript, comandos npm y exclusión de secretos en Git.

La conexión se realiza desde el servidor Node.js. No se usa `readline-sync`: el menú de consola del ejemplo de clase se reemplazará por las pantallas de la web y las rutas de la API. Por ahora no hay operaciones de clientes, pagos ni otros módulos implementadas.

## Tecnologías actuales

| Parte | Tecnología |
|---|---|
| Frontend | HTML, CSS, TypeScript y Vite |
| Backend | Node.js, TypeScript y servidor HTTP incorporado de Node |
| Acceso a datos | Librería oficial `mongodb`, mediante `MongoClient` |
| Base de datos | MongoDB Atlas, creada previamente por el usuario |

Se requiere Node.js 24 o superior. En este equipo se comprobó la versión 24.15.0. Node ejecuta directamente el TypeScript usado en desarrollo; TypeScript también verifica los tipos y permite generar JavaScript para producción.

## Organización actual

```text
TF Gimmanager/
├── src/                   TypeScript y CSS del frontend
├── public/                Archivos públicos del frontend
├── index.html             HTML del frontend
├── package.json           Dependencias y comandos de Vite
├── README.md              Guía y bitácora
└── backend/
    ├── src/
    │   ├── db.ts                  Conexión compartida a Atlas
    │   ├── check-connection.ts    Comprobación de conexión
    │   └── server.ts              Servidor HTTP inicial
    ├── .env.example          Ejemplo de configuración, sin secretos
    ├── .env                  Configuración privada que completa el usuario
    ├── .gitignore            Excluye secretos, dependencias y compilados
    ├── package.json          Dependencias y comandos del backend
    ├── package-lock.json     Versiones instaladas del backend
    └── tsconfig.json         Configuración de TypeScript del backend
```

`.env` no se incluye con valores reales: se crea copiando el ejemplo. `node_modules` y `dist` son carpetas generadas y no se versionan.

```text
Navegador (Vite) → API Node.js → MongoDB Atlas
```

Los dos `package.json` tienen responsabilidades diferentes. Los comandos del frontend se ejecutan desde la carpeta principal y los del backend desde `backend`.

## Completar la conexión con Atlas

1. Abrir una terminal en el backend:

   ```powershell
   cd "C:\Users\Emanu\OneDrive\Desktop\TF Gimmanager\backend"
   ```

2. Crear el archivo privado una sola vez, sin sobrescribirlo si ya está completado:

   ```powershell
   Copy-Item .env.example .env
   ```

   El comando anterior corresponde a PowerShell. Si se utiliza Git Bash (MINGW64), usar en su lugar:

   ```bash
   cp .env.example .env
   ```

   Si `.env` ya está configurado y la conexión funciona, no volver a copiar el ejemplo porque sobrescribiría los valores.

3. En Atlas, abrir el cluster y seleccionar **Connect → Drivers → Node.js**. Copiar la cadena provista por Atlas.

4. Abrir `backend/.env` y completar:

   ```dotenv
   MONGODB_URI="mongodb+srv://USUARIO:CONTRASENA@HOST_DEL_CLUSTER/?retryWrites=true&w=majority"
   MONGODB_DB="NOMBRE_REAL_DE_LA_BASE"
   PORT=3000
   ```

   Los valores de este bloque son marcadores, no credenciales reales. Usar la URI del propio cluster, mantener sus opciones y completar el nombre exacto de la base ya existente. La cuenta de base de datos puede ser distinta de la cuenta usada para iniciar sesión en la página de Atlas. Codificar como componentes de URL el usuario y contraseña si contienen caracteres especiales.

5. Confirmar que la IP del equipo está permitida en **Network Access** y que el usuario de base de datos tiene los permisos necesarios.

6. Probar desde `backend`:

   ```powershell
   npm run check:db
   ```

   Si la conexión y el ping resultan exitosos, aparece el mensaje `Conexion y ping a MongoDB Atlas exitosos.`. Este comando no crea ni modifica registros.

El archivo `.env` está excluido de Git. La contraseña y la URI nunca deben colocarse en el código del frontend, variables `VITE_*`, capturas, README ni commits. En el servidor de publicación se pueden configurar estas mismas variables de entorno sin subir un archivo `.env`.

Los comandos cargan `.env` al iniciar; después de cambiarlo hay que reiniciar el proceso. Los errores de conexión se muestran sin imprimir la URI ni el error completo del driver.

## Ejecutar la web y el backend

### Backend

Desde `backend`, luego de completar `.env`:

```powershell
npm install
npm run dev
```

Las dependencias ya se instalaron durante esta preparación; `npm install` sirve para reconstruirlas al clonar el proyecto. El proceso se reinicia cuando cambia el código del backend. Después de verificar Atlas, el servidor escucha en el puerto configurado, por defecto 3000.

La ruta `http://localhost:3000/api/salud` responde `{"estado":"ok"}` cuando el servidor está iniciado. Esta ruta no realiza un ping nuevo por solicitud; la verificación de MongoDB ocurre durante el arranque.

### Frontend

En otra terminal, desde la carpeta principal `TF Gimmanager`:

```powershell
npm run dev
```

Abrir la dirección que muestre Vite. El frontend todavía no consume el backend; la integración de solicitudes, permisos y módulos se hará en pasos posteriores.

### Verificación y compilación del backend

Desde `backend`:

```powershell
npm run check
npm run build
```

Para ejecutar la versión compilada, después de generar `dist`:

```powershell
npm start
```

## Reutilizar la conexión en futuros módulos

Dentro de archivos del backend se puede importar la función compartida:

```typescript
import { conectarDB } from './db.ts'

const db = await conectarDB()
const clientesCollection = db.collection('clientes')
```

Esto es un ejemplo de uso, todavía no una operación implementada de gestión de clientes. Las llamadas concurrentes reutilizan la misma inicialización y el mismo cliente. El cliente permanece abierto mientras el servidor funciona y se cierra al detenerlo; no se crea ni se cierra en cada consulta.

## Pendiente: actualizar los documentos del TP

**Modificar los Markdown del TP para reemplazar Java/Spring Boot por Node.js y TypeScript en la descripción del backend.** Esta decisión fue aprobada por el usuario, pero los documentos del ZIP todavía no se modificaron.

Revisar especialmente:

- README principal del TP y `backend/README.md`: stack, justificación, comandos y requisitos de ejecución.
- `ARQUITECTURA.md` y `DIAGRAMA_DE_DESPLIEGUE.md`: backend Node.js y acceso mediante el driver oficial de MongoDB.
- `DIAGRAMAS_DE_SECUENCIA.md` y las imágenes de los diagramas: sustituir referencias específicas a componentes Spring cuando corresponda.
- `SEGURIDAD.md`: reemplazar Spring Security y sus anotaciones por el mecanismo de autenticación y autorización que se elija para Node.js.
- `REQUERIMIENTOS_NO_FUNCIONALES.md`, matriz de trazabilidad y otras referencias a Java, Maven o Spring Data MongoDB.

El cambio de tecnología no modifica por sí solo los roles, permisos, módulos ni reglas de negocio. La autenticación y autorización todavía deben implementarse; este backend inicial no las incluye.

## Verificación del cambio a Node.js

- `npm run check` del backend: aprobado, sin errores de tipos.
- `npm run build` del backend: aprobado, genera JavaScript en `backend/dist`.
- Se comprobó que tanto la prueba de conexión como el servidor terminan con error cuando faltan las variables de Atlas, sin exponer credenciales ni iniciar el servidor.
- Se comprobó que `.env`, dependencias y compilados del backend están excluidos de Git.
- La compilación del frontend Vite también finalizó correctamente.
- Durante la preparación inicial no se probó una conexión real con Atlas. Posteriormente el usuario confirmó una conexión y un ping exitosos, como se registra en el avance 6. El asistente no utilizó las credenciales del ejemplo compartido en el chat.


### 6. Conexión con MongoDB Atlas verificada por el usuario

El usuario ejecutó `npm run check:db` desde `backend` en Git Bash y obtuvo:

```text
Conexion y ping a MongoDB Atlas exitosos.
```

Esto confirma que, en esa ejecución, el cliente pudo conectarse y ejecutar un ping con la configuración disponible. No demuestra todavía operaciones CRUD ni permisos de escritura. El script de comprobación cierra el cliente al terminar.

El comando `Copy-Item` indicado inicialmente es de PowerShell y no funciona en Git Bash. Su equivalente en Git Bash es `cp .env.example .env`. Si la configuración ya funciona, no se debe sobrescribir el archivo `.env` con el ejemplo.

### 7. Estilos globales y estructura inicial del registro

Se verificó que el usuario incorporó en `src/style.css` las variables globales y los estilos base: color principal celeste, superficies blancas, fondo crema, tipografías, espaciados y estados de foco.

El usuario prefiere nombres en español para variables, clases e identificadores propios. Mantener esa preferencia en las próximas propuestas de código.

Se verificó la existencia de `src/auth/register/register.html`, `register.css` y `register.ts`. El HTML del registro y su integración se están proponiendo por el chat; no se consideran implementados todavía.

### 8. Revisión del TP de Programación 3 como referencia

A pedido del usuario, se revisó el ZIP `final-prog3.zip` en modo lectura, especialmente registro, login, navegación compartida y configuración de Vite.

Para las próximas propuestas se toma como referencia su organización: páginas HTML completas, un TypeScript por pantalla para eventos y validaciones, componentes compartidos generados desde TypeScript cuando corresponda y estilos globales reutilizables. En GymManager también se mantiene el CSS específico de cada pantalla y los nombres propios en español.

El TP de referencia utiliza múltiples páginas HTML declaradas como entradas en la compilación de Vite. Si se adopta este esquema en GymManager, se deberá configurar la compilación de las páginas y reemplazar la propuesta anterior de insertar el HTML con `?raw`. Este cambio de frontend todavía no se considera implementado.

La persistencia y autenticación del TP anterior se simulaban con JSON y localStorage. Para GymManager se mantendrá el backend Node.js y MongoDB Atlas: las cuentas se guardarán y validarán en el servidor, y las contraseñas se almacenarán mediante hash, no en localStorage.

### 9. Pantalla de registro y preparación de Google

Se verificó que el usuario incorporó el HTML completo de `register.html` y el CSS específico de `register.css`. La página carga el CSS global y el propio; el usuario confirmó que el diseño se ve bien. `register.ts` todavía está vacío.

El usuario solicitó avanzar con TypeScript en partes pequeñas, comenzando por las bibliotecas. Mantener el enfoque paso a paso y no entregar el registro completo de una sola vez.

El usuario pidió incluir el registro/inicio de sesión mediante Google. Esto amplía el alcance respecto de los documentos originales que lo excluían: agregar ese cambio a la actualización pendiente de los Markdown del TP. Se prevé Google Identity Services en el navegador y verificación del token en el backend; su carga, configuración e integración todavía no se consideran implementadas. El registro convencional por correo y contraseña es una opción distinta de Continuar con Google.

### 10. Validación de la colección usuarios compartida por el usuario

El usuario compartió el validador actual de `usuarios`. Requiere `nombre`, `apellido`, `email`, `passwordHash`, `rol`, `activo`, `fechaCreacion` y `fechaModificacion`. Los cuatro primeros son cadenas; `rol` admite `ADMIN`, `ENTRENADOR` o `USUARIO`; `activo` es booleano y las fechas son BSON Date. `clienteId` admite ObjectId o null y es opcional; `fechaBaja` admite Date o null y es opcional.

El formulario debe enviar los datos personales y la contraseña; el backend debe generar el hash, asignar el rol de cliente `USUARIO`, el estado inicial y las fechas. No aceptar un rol administrativo elegido por el navegador.

Posteriormente el usuario compartió la definición exacta de los índices: `email_1` sobre `email`, con `unique: true`, y `clienteId_1` sobre `clienteId`, con `unique: true` y `sparse: true`, además del índice predeterminado `_id_`. Esto confirma unicidad de email y de los valores presentes de clienteId. Cuando una cuenta todavía no tiene ficha asociada, omitir `clienteId` en el documento; no guardarlo como `null`, porque el índice sparse incluye los valores null y su unicidad impediría repetirlos.

Pendiente de diseño para Google: el validador exige siempre `passwordHash`, pero una cuenta creada exclusivamente con Google no tiene una contraseña local elegida por el usuario. Antes de implementar este flujo, acordar un modelo que identifique la cuenta de Google mediante su identificador `sub` y adapte condicionalmente el requisito de contraseña. No usar el token de Google como contraseña ni rellenar el hash con una cadena vacía para eludir el validador. No se modificó la base de datos.


### 11. Google postergado; prioridad al registro con correo y contraseña

Al inicio se intentó incorporar la opción de registrarse e iniciar sesión con Google. Durante la preparación se observó que comprender e integrar esta tecnología nueva requería más tiempo de aprendizaje del previsto. Por ese motivo, se decidió excluirla del MVP de la primera entrega y trasladarla a las funcionalidades futuras. La integración no llegó a completarse.

La prioridad actual es implementar únicamente el registro convencional con nombre, apellido, email y contraseña, avanzando con TypeScript en partes pequeñas.

La propuesta de incorporar Google al alcance inmediato queda reemplazada por esta decisión. No hace falta configurar ahora un cliente OAuth ni modificar el validador para Google. El esquema actual con `passwordHash` obligatorio permite desarrollar el registro convencional.

Si se agregó el script de Google a `register.html`, retirarlo mientras no se utilice. El asistente mantiene el frontend en modo lectura y entrega el código por el chat.


### 12. Inicio de la lógica del formulario de registro

Se verificó que el usuario incorporó en `register.ts` la selección tipada del formulario, la comprobación de su existencia y el evento `submit` con `preventDefault()`. También se verificó que retiró el script de Google del HTML.

El siguiente paso propuesto por el chat es leer los campos con FormData, comprobar datos vacíos y coincidencia de contraseñas, y mostrar errores mediante el elemento `mensaje-registro`. Estas validaciones y el envío al backend todavía no se consideran implementados.

### 13. Navegación inicial y validaciones en español

Se verificó que `main.ts` redirige temporalmente a la página HTML del registro y que el usuario agregó `novalidate` al formulario para reemplazar los carteles nativos del navegador por mensajes propios en español.

En `register.ts` ya están implementadas la lectura de campos mediante FormData, la comprobación de campos vacíos o con solo espacios y la coincidencia de contraseñas. La validación del formato del correo se propone como siguiente paso; el envío al backend sigue pendiente. La comprobación de correos duplicados debe resolverse en el backend, respetando el índice único de email.

### 14. Revisión del TypeScript y próximos pasos del registro

Se verificó que el usuario agregó la validación básica del formato de correo en `register.ts`. El archivo actual comprueba campos vacíos, coincidencia de contraseñas y formato de correo. El backend sigue ofreciendo únicamente `GET /api/salud`: todavía no hay un endpoint para crear cuentas ni para comprobar una sesión.

El usuario pidió una versión completa y comentada del TypeScript. Se propone consolidar las validaciones actuales, mensajes específicos por campo y, como regla inicial pendiente de incorporar y acordar con el backend, un mínimo de ocho caracteres para la contraseña. No marcar el registro como exitoso antes de que el servidor confirme la creación real.

La comprobación de sesión se centralizará más adelante en un módulo compartido, cuando se implemente la autenticación. No depende de tener diseñada la página principal, pero necesita una sesión verificable por el backend y un destino de navegación definido. No considerar que un usuario está autenticado solamente porque existe un valor en localStorage.

### 15. Preparación de la integración del registro con el backend

Se verificó que el usuario incorporó la versión comentada de `register.ts`, con mensajes específicos y un mínimo de ocho caracteres para la contraseña.

Se propone por el chat conectar el formulario con `POST /api/usuarios/registro`, crear el controlador correspondiente en el backend, usar `bcryptjs` para generar `passwordHash` y utilizar el proxy de desarrollo de Vite para enviar las solicitudes al servidor Node.js. El registro asignará `USUARIO`, `activo: true` y fechas BSON, sin incluir `clienteId` hasta que exista la vinculación.

La biblioteca adicional, el controlador, la ruta, el proxy y el envío del formulario todavía no se consideran instalados ni implementados. No se crearon cuentas de prueba ni se modificaron datos en Atlas durante esta revisión. Este registro no implica iniciar sesión automáticamente: autenticación y comprobación de sesión siguen pendientes.

### 16. Integración incorporada y diagnóstico del primer intento

Se verificó que el usuario incorporó el controlador `backend/src/controladores/registro.ts`, la ruta POST del servidor, la dependencia `bcryptjs`, el proxy de Vite y el envío con fetch desde el formulario. También agregó `async` al evento submit.

Se ejecutaron las comprobaciones de TypeScript del frontend y del backend sin generar archivos; ambas finalizaron sin errores.

El usuario informó que el backend conecta a Atlas y escucha en el puerto 3000, pero no encontró el usuario tras intentar registrarse. La base configurada para esta ejecución es `gym_manager` y la colección usada por el controlador es `usuarios`. Todavía falta confirmar el mensaje o respuesta HTTP del formulario y verificar la inserción; el arranque del servidor no demuestra por sí solo que se haya creado una cuenta. El asistente no insertó usuarios ni modificó datos de Atlas.

### 17. Registro confirmado y criterio de zona horaria

El usuario confirmó el mensaje de creación exitosa y luego encontró los documentos en Compass al actualizar la vista. Queda comprobado por la prueba del usuario que el registro guarda cuentas en `gym_manager.usuarios`, con hash de contraseña, rol USUARIO, estado activo y fechas BSON. El asistente no creó estos documentos.

Compass muestra en la captura las fechas en UTC (+00:00). Por ejemplo, `2026-10-24T01:12:15.876Z` corresponde al 23 de octubre de 2026 a las 22:12:15.876 en Buenos Aires (UTC-3): representa el mismo instante.

Mantener `new Date()` y el almacenamiento como BSON Date. Al mostrar fechaCreacion o fechaModificacion en la web, formatear en español argentino y con zona `America/Argentina/Buenos_Aires`, por ejemplo mediante Intl.DateTimeFormat. No restar tres horas al valor antes de guardarlo ni convertirlo a texto local en la base. La función compartida de formato se implementará cuando haya una pantalla que muestre esas fechas.


### 18. Errores por campo y estilos compartidos de autenticación

El usuario confirmó que el intento de registrar un correo existente devuelve el mensaje esperado. Luego autorizó modificar directamente los detalles visuales y crear `auth.css`.

Se trasladaron los estilos comunes a `src/auth/auth.css`, con clases reutilizables para la página, tarjeta, título, formulario, botón y pie. `register.html` carga primero `style.css`, luego `auth.css` y por último `register.css`. Este último queda reservado para ajustes exclusivos del registro, sin duplicar los estilos compartidos.

En `register.ts` se incorporaron:

- Marcado de todos los campos incorrectos mediante `aria-invalid`, con borde y foco rojos.
- Un único mensaje para campos vacíos, sin repetirlo por cada casilla.
- Mensajes específicos para correo inválido, límites de longitud y contraseñas diferentes.
- Foco en el primer campo incorrecto al intentar enviar.
- Revalidación mientras se corrigen los datos, después del primer intento.
- Marcado del correo cuando el backend responde 409 por duplicado. Los errores generales del servidor no se atribuyen a un campo.
- Asociación accesible entre los campos incorrectos y el mensaje mediante `aria-describedby`.
- Estilo de éxito separado del error; bloqueo temporal de edición mientras se procesa el envío para mantener consistente la respuesta con los datos enviados.

Verificación: TypeScript del frontend sin errores; comprobación en el navegador de campos vacíos, correo inválido, contraseñas diferentes y retiro del borde rojo al corregir. Se comprobaron localmente, con respuestas simuladas, el correo duplicado y el error general del servidor. No se hicieron registros reales ni cambios en Atlas durante estas pruebas. El login todavía no se creó.

### 19. Pantalla de login y propuesta de funcionamiento

Se verificó que el usuario creó `src/auth/login/login.html`, `login.css` y el TypeScript inicial. El HTML reutiliza los estilos globales y `auth.css`; el usuario confirmó que la pantalla se ve bien.

A pedido del usuario, se entrega por el chat el TypeScript del login con validaciones en español, indicadores por campo y una solicitud prevista a `POST /api/usuarios/login`. El usuario lo incorporará antes de trabajar sobre el backend. No se considera implementado ni probado todavía el acceso real.

El backend deberá verificar la contraseña con bcrypt, comprobar que la cuenta esté activa y establecer una sesión mediante una cookie HttpOnly. El frontend no guardará contraseñas ni simulará autenticación en localStorage. La comprobación de una sesión existente y la redirección se completarán junto con el backend; no redirigir a la raíz mientras main.ts todavía envíe al registro.

### 20. Preparación del controlador de login

Se verificó que el usuario creó `backend/src/controladores/login.ts` y pegó el TypeScript del login en el frontend. También renombró el controlador de registro a `backend/src/controladores/register.ts` y actualizó su importación en server.ts; la URL del registro sigue siendo `/api/usuarios/registro`.

Se propone por el chat el controlador para `POST /api/usuarios/login`, con verificación mediante bcrypt, rechazo genérico de credenciales incorrectas o cuentas inactivas y creación de una sesión de ocho horas. La sesión se identificará mediante una cookie HttpOnly; MongoDB guardará solo el hash del token aleatorio en una colección técnica adicional `sesiones`, con vencimiento e índice TTL. La implementación y prueba real del login siguen pendientes de que el usuario incorpore el código.

Actualizar los documentos del TP para reflejar el mecanismo de sesión finalmente adoptado y la colección técnica adicional; los documentos originales describían JWT. La validación de sesiones deberá comprobar explícitamente el vencimiento y el estado actual del usuario: la eliminación por TTL no es inmediata. Falta crear la consulta de sesión, el cierre de sesión y la redirección a la página principal.

### 21. Login probado y revisión de las pantallas por rol

El usuario confirmó desde la web que las credenciales incorrectas muestran el error esperado y que una cuenta creada mediante el registro obtiene el mensaje de inicio de sesión correcto. Se verificó en los archivos la incorporación del controlador de login y su ruta. La restauración y validación de sesión, el cierre de sesión y la redirección por rol todavía no están implementados.

Se volvieron a leer del ZIP los documentos MODULOS, REQUERIMIENTOS_FUNCIONALES, SEGURIDAD y MOCKUPS. El perfil del cliente incluye rutina vigente, turno asignado e historia clínica propia opcional. El dashboard de indicadores generales corresponde al administrador. El entrenador trabaja con rutinas, catálogo, turnos e historia clínica según sus permisos; los documentos no definen un diseño de inicio exclusivo para él. Siguen pendientes de unificación los permisos de edición del catálogo y registro de pagos del entrenador.

Como propuesta de navegación, el cliente tendría su perfil y el personal (ADMIN/ENTRENADOR) compartiría la estructura visual de un panel, con menú y funciones según rol. Esto todavía no se considera una implementación ni una política adicional aprobada. Los permisos deben verificarse en el backend, además de adaptar la interfaz.

El registro actual crea una cuenta en usuarios, no una ficha en clientes, y no inicia sesión automáticamente. Los documentos dejan pendiente el flujo exacto del alta y vinculación. La futura pantalla debe contemplar una cuenta sin clienteId y no presentar rutinas o turnos ficticios ni considerar la antigüedad de la cuenta como fecha de alta del cliente. La vinculación debe realizarse de forma verificada, conservando la relación uno a uno.

Siguiente secuencia propuesta: consulta y validación de sesión + cierre de sesión; pantalla del cliente con estados vacíos; navegación por rol hacia destinos existentes. Si se quiere entrar al perfil inmediatamente después del registro, habrá que agregar explícitamente el inicio de sesión automático: no ocurre con el código actual.

### 22. Propuesta de consulta y cierre de sesión

Se revisó la implementación actual: el login guarda tokenHash y fechaVencimiento en sesiones, establece la cookie gymmanager_sesion y todavía no tiene rutas de consulta ni cierre.

Se entrega por el chat la propuesta de `backend/src/controladores/sesion.ts`, con un helper reutilizable para recuperar al usuario autenticado, consulta GET de sesión y cierre POST. La consulta deberá comprobar token, vencimiento, usuario activo y rol válido, devolviendo únicamente datos básicos. El cierre eliminará solo la sesión actual y expirará la cookie; se enviará como JSON para evitar solicitudes de formulario convencionales. No se modificaron los archivos del backend ni se ejecutaron cierres reales. Las rutas siguen pendientes hasta que el usuario incorpore el código.
