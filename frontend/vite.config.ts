import { defineConfig } from 'vite'
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

function paginas(carpeta: string): string[] {
  return readdirSync(carpeta, { withFileTypes: true }).flatMap(entrada => {
    const ruta = resolve(carpeta, entrada.name)
    return entrada.isDirectory() ? paginas(ruta) : entrada.name.endsWith('.html') ? [ruta] : []
  })
}

export default defineConfig({
  build: {
    rolldownOptions: {
      input: [resolve('index.html'), ...paginas(resolve('src'))],
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
