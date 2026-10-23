# GymManager — Bitácora de desarrollo

Proyecto web de gestión de gimnasio desarrollado como parte del Trabajo Final Integrador.

## Acuerdo de trabajo con el asistente

- El usuario crea e incorpora el código del proyecto. El asistente puede leer los archivos para responder con contexto y enviar propuestas de código por el chat.
- El asistente no debe crear, modificar ni eliminar otros archivos del proyecto sin autorización del usuario.
- El asistente debe actualizar este `README.md` con cada avance confirmado, manteniendo una bitácora de los pasos realizados.
- El usuario autorizó como excepción puntual la creación del backend inicial, su reemplazo por Node.js/TypeScript y la configuración de conexión con MongoDB Atlas. Esta autorización no habilita cambios generales posteriores en el código.
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
