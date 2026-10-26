import './style.css'
import { obtenerSesion, redirigirSegunRol } from './servicios/sesion.ts'
const aviso = document.querySelector<HTMLDivElement>('#app')!
aviso.textContent = 'Comprobando tu sesión…'
obtenerSesion().then(usuario => {
  if (usuario) redirigirSegunRol(usuario)
  else window.location.replace('/src/auth/login/login.html')
}).catch(() => { aviso.textContent = 'No pudimos conectar con el servidor. Verificá que el backend esté iniciado y recargá la página.' })
