# GymManager — Bitácora de desarrollo

Proyecto web de gestión de gimnasio desarrollado como parte del Trabajo Final Integrador.

## Acuerdo de trabajo con el asistente

- El usuario crea e incorpora el código del proyecto. El asistente puede leer los archivos para responder con contexto y enviar propuestas de código por el chat.
- El asistente no debe crear, modificar ni eliminar otros archivos del proyecto sin autorización del usuario.
- El asistente debe actualizar este `README.md` con cada avance confirmado, manteniendo una bitácora de los pasos realizados.
- El usuario autorizó como excepción puntual la creación del backend inicial y la configuración de conexión con MongoDB Atlas. Esta autorización no habilita cambios generales posteriores en el código.
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


### 5. Creación del backend para MongoDB Atlas

El usuario autorizó al asistente a crear esta parte del proyecto. Se generó la carpeta `backend` utilizando Spring Initializr, con Java 21 como versión objetivo, Maven, Spring Boot 4.1.2 y las dependencias Spring Web y Spring Data MongoDB.

La base de datos de Atlas ya fue creada por el usuario. La conexión real todavía requiere completar la configuración privada y probar el acceso.

## Cómo se organiza el proyecto

```text
TF Gimmanager/
├── src/                  TypeScript y CSS del frontend
├── public/               Archivos públicos del frontend
├── index.html            Entrada HTML del frontend
├── package.json          Dependencias y comandos de Vite
├── README.md             Esta guía y bitácora
└── backend/              Aplicación Java con Spring Boot
    ├── pom.xml           Dependencias del backend
    ├── mvnw.cmd          Permite usar Maven en Windows
    ├── .mvn/             Configuración del Maven Wrapper
    ├── atlas-local.properties.example  Ejemplo sin credenciales reales
    └── src/
        ├── main/
        │   ├── java/com/gymmanager/GymmanagerApplication.java
        │   └── resources/application.properties
        └── test/         Prueba inicial generada por Spring Initializr
```

El frontend presenta la web en el navegador. El backend se ejecuta como un proceso separado y es el encargado de conectarse a MongoDB Atlas. Ambos pertenecen al mismo repositorio Git.

```text
Navegador (frontend) → API Java (backend) → MongoDB Atlas
```

La dependencia de MongoDB se declara una sola vez en `backend/pom.xml`. Spring Boot administra un cliente compartido y su conjunto de conexiones. No hace falta copiar una conexión en cada módulo ni instalar el driver de MongoDB en Vite.

## Cómo completar la conexión con Atlas

1. Abrir una terminal dentro de `backend`:

   ```powershell
   cd "C:\Users\Emanu\OneDrive\Desktop\TF Gimmanager\backend"
   ```

2. Crear la configuración privada a partir del ejemplo (hacerlo una sola vez y no sobrescribir un archivo privado ya completado):

   ```powershell
   Copy-Item atlas-local.properties.example atlas-local.properties
   ```

3. En Atlas, abrir el cluster y seleccionar **Connect → Drivers → Java**. Copiar su cadena de conexión y completar los datos del usuario de base de datos, su contraseña y el nombre real de la base de datos. El usuario de base de datos puede ser distinto del usuario con el que se inicia sesión en la web de Atlas.

4. Abrir `backend/atlas-local.properties` y reemplazar el valor de ejemplo de `MONGODB_URI` por la cadena completa. Mantener las opciones que proporcione Atlas. Si el usuario o contraseña contienen caracteres especiales, aplicar la codificación de URL correspondiente a esos componentes. No publicar esta cadena ni agregarla al README.

5. Verificar en Atlas que la IP del equipo esté permitida en **Network Access** y que el usuario de base de datos tenga permisos sobre la base elegida.

El archivo `atlas-local.properties` está excluido mediante `backend/.gitignore`. No se ubica dentro de `src/main/resources`, para que no se incluya como recurso en el archivo compilado del backend. El ejemplo sí se puede versionar porque no contiene credenciales reales.

`backend/src/main/resources/application.properties` importa el archivo privado y utiliza `${MONGODB_URI}` para configurar la conexión. En un servidor también se puede definir `MONGODB_URI` como variable de entorno, sin crear ese archivo privado.

No colocar la URI de Atlas ni la contraseña en el TypeScript del frontend o en variables con prefijo `VITE_`, porque su contenido se puede exponer en el navegador.

## Cómo ejecutar el proyecto

### Requisito del backend

Instalar un JDK compatible con Java 21 o superior y configurar `JAVA_HOME` apuntando a la carpeta del JDK. No hace falta instalar Maven por separado: se incluye Maven Wrapper. En el primer uso, necesita acceso a Internet para descargar Maven y las dependencias.

### Backend

Desde la carpeta `backend`, con la configuración de Atlas completada:

```powershell
.\mvnw.cmd spring-boot:run
```

La aplicación utiliza el puerto 8080 por defecto. Se debe ejecutar desde `backend` para que encuentre el archivo privado local. La estructura inicial todavía no incluye pantallas ni endpoints de clientes, ejercicios o pagos. El arranque por sí solo no demuestra una consulta exitosa a Atlas: falta verificar una operación real contra la base.

### Frontend

En otra terminal, desde la carpeta principal `TF Gimmanager`:

```powershell
npm run dev
```

Vite muestra la dirección para abrir la web. El frontend todavía no realiza solicitudes al backend; esa integración se desarrollará después.

## Verificación del backend inicial

- Se compiló y empaquetó correctamente con Maven Wrapper (`package -DskipTests`).
- Se utilizó el JDK 25 ya instalado en el equipo, manteniendo Java 21 como versión objetivo del proyecto.
- Se comprobó que `backend/atlas-local.properties` está excluido de Git.
- No se ejecutó la prueba inicial ni se probó todavía una conexión real con Atlas: faltan las credenciales privadas.

En este equipo `JAVA_HOME` no está configurado. Para ejecutar el backend desde una terminal de PowerShell, se puede configurar solamente para esa terminal antes de iniciar:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-25'
.\mvnw.cmd spring-boot:run
```

La compilación de verificación guardó las descargas de Maven dentro de `backend/target/.maven`, excluido de Git. Para reutilizarlas en esta misma carpeta y evitar descargarlas nuevamente, se puede ejecutar desde `backend`:

```powershell
$env:JAVA_HOME = 'C:\Program Files\Java\jdk-25'
$env:MAVEN_USER_HOME = Join-Path (Get-Location) 'target\.maven'
.\mvnw.cmd '-Dmaven.repo.local=target/.maven/repository' spring-boot:run
```
