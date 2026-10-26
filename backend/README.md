# Backend — GymManager

API HTTP implementada con Node.js 24, TypeScript y el driver oficial de MongoDB. La base de datos se aloja en Atlas. Los documentos de diseño exteriores a esta carpeta siguen pendientes de actualizar por el equipo.

## Ejecución local

Desde esta carpeta:

```bash
npm ci
npm run dev
```

Configurar MONGODB_URI y MONGODB_DB en .env tomando .env.example como referencia. El archivo privado está excluido de Git. PORT es opcional y por defecto vale 3000.

## Comprobaciones y compilación

```bash
npm run check
npm test
npm run build
```

Las pruebas usan una base en memoria y no escriben en Atlas. Para servir también la web es necesario compilar frontend desde su propia carpeta. El backend sirve únicamente frontend/dist, no las fuentes ni los archivos privados.

```bash
npm start
```

## Código común y sesiones

servicios/autenticacion.ts centraliza creación de sesiones, índices y cookie, compartidos por login, registro y cambio de contraseña. La duración se define una sola vez y es de ocho horas. La base guarda el hash del token, nunca el token original. compartidos/http.ts centraliza respuestas, errores y lectura segura de JSON. Login, registro y clientes mantienen un límite de 16 KB; las demás rutas conservan su límite de 64 KB.

## Agenda compartida y permisos

ADMIN y ENTRENADOR usan el mismo generador. ADMIN modifica horarios de apertura y cupo general y administra a todos los entrenadores. ENTRENADOR puede generar horarios para sus propios días usando esos valores generales, consultar y editar sus turnos y asignar o retirar clientes en ellos. El servidor rechaza cambios en agendas ajenas y en la configuración general. Las preferencias de otros entrenadores se conservan al generar. Las operaciones masivas y el borrado definitivo siguen siendo exclusivos de ADMIN.

## Revisión del 26/10/2026

39 pruebas automatizadas aprobadas, incluida generación propia del entrenador, protección de agendas ajenas, sesión de ocho horas, errores de credenciales y lectura segura de JSON. La compilación y la navegación se comprobaron después de reorganizar el frontend. No se modificaron los README exteriores a backend/frontend ni se ejecutaron escrituras de prueba sobre Atlas.
