This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Descubrimiento automático

La pantalla conserva **Búsqueda manual** y ofrece **Descubrimiento automático** sin palabra clave ni selección de nicho. Elegí país e idioma y presioná **Descubrir productos**. Reutiliza agrupación, Ollama, verificación de páginas, asociación y ranking.

### Exactitud comercial

- Un candidato pago necesita una única oferta digital, una acción de compra y un precio positivo ligado al producto en la misma cláusula. Precios anteriores/habituales, regalos, varios productos, contradicciones y texto incompleto permanecen pendientes de revisión. No se toma cualquier precio del anuncio o de la página.
- El extractor de navegador excluye precios dentro de `del`, `s`, `strike`, texto oculto y estilos computados de tachado. Si el precio anterior está expresado en palabras, la oferta queda pendiente. No se interpretan precios de imágenes, vídeos o estilos de tachado que el DOM no permita identificar: requiere revisión humana.
- Una landing sólo aporta puntos cuando el anuncio contiene su URL completa de producto, coinciden ruta, parámetros y fragmento, no hay redirección a otra URL, coincide el tipo digital y al menos dos palabras distintivas del nombre del producto con un único `h1` visible. También requiere respuesta HTTP accesible y evidencia actual de pago. Compartir dominio no basta. No se confía en estados ni asociaciones reenviados por el cliente: el ranking los recalcula.
- La asociación es evidencia conservadora, no prueba de compra, checkout operativo o entrega. Sin URL/nombre suficiente, el anuncio conserva su candidatura y no recibe puntos de la landing. URLs de seguimiento o redirecciones legítimas pueden quedar pendientes.
- No se calculan ventas, ingresos, ROAS ni rentabilidad. Ollama es auxiliar; sus afirmaciones no confirman pagos ni otorgan puntos. El orden predeterminado prioriza evidencia; sólo cambia si el usuario elige puntaje, antigüedad o cantidad de anuncios.

### Presupuestos e identidad

- Las seis categorías (ebooks, cursos, plantillas, imprimibles, packs y software) tienen cuotas de nuevos IDs de **17/17/17/17/16/16**. Ninguna categoría puede ocupar todo el cupo de 100 anuncios. Cada consulta recibe una porción del tiempo restante para reservar oportunidades a las demás, hasta 18 segundos por consulta y 120 segundos totales. Cancelación, desconexión o un fallo fuera del presupuesto pueden impedir completar todas; se informa cobertura y errores.
- Se realizan búsquedas secuenciales con pausas de 750 ms. Hay una sola tarea de navegador por proceso y una pausa de 30 segundos entre descubrimientos. No es un limitador distribuido entre servidores.
- Se conservan la versión más completa de cada ID, sus datos complementarios, categorías y observaciones originales. Versiones contradictorias quedan marcadas para revisión. Las categorías posteriores pueden completar IDs ya encontrados aunque se haya usado su cuota de nuevos anuncios.
- Agrupar requiere texto completo idéntico y URLs explícitas de producto coincidentes. Sin identidad suficiente, cada ID permanece separado. No se agrupa por introducción, anunciante o dominio. El ranking no unifica productos por URLs sin parámetros ni fusiona grupos distintos por compartir landing.
- El modo automático realiza hasta cinco análisis con Ollama y verifica hasta cinco páginas. El modo manual permite **continuar en lotes de cinco** y reiniciar después del último lote. Errores de páginas no equivalen a verificaciones exitosas.
- La búsqueda manual conserva cuatro desplazamientos de 1,5 segundos, hasta 60 segundos de navegación y 15 segundos esperando identificadores, con presupuesto total de 100 segundos. La automática usa dos desplazamientos y esperas menores por su presupuesto entre categorías. Las respuestas están acotadas a 100 anuncios y hasta 100 enlaces manuales; no cubren toda la biblioteca.

### Texto, idiomas y cancelación

- Países iniciales: Argentina, México, España, Colombia, Chile, Perú, Uruguay, Brasil, Estados Unidos y Reino Unido. El país es un filtro de distribución de Meta, no el origen del anunciante.
- Idiomas: español, inglés, portugués o todos. Es una estimación heurística del texto, independiente del país y de la interfaz de Meta; puede fallar en textos breves o mixtos. Los desconocidos se excluyen al filtrar. “Todos” no filtra, pero las semillas usan el idioma habitual del país y no garantizan cobertura multilingüe.
- Se conserva el texto de cada sección de anuncio, sin el antiguo corte a once líneas. Más de 20.000 caracteres o un marcador visible de “ver más” se consideran texto incompleto y no habilitan clasificación paga. El límite de extracción de páginas es 100.000 caracteres; si se excede tampoco se habilita evidencia paga. Los formatos de fecha no reconocidos mantienen antigüedad desconocida.
- Cancelar detiene nuevas solicitudes. **Sólo se conservan respuestas ya recibidas**: los anuncios acumulados en una búsqueda cuya respuesta todavía no llegó no se recuperan al cancelarla.

### Requisitos y comprobaciones

Usar el checkout existente; no hace falta otro worktree. Node.js compatible con Next.js 16 (entorno validado con Node 24), `npm ci`, `npx playwright install chromium`, Ollama en `127.0.0.1:11434` y `ollama pull qwen2.5:7b`. Iniciar Ollama y luego `npm run dev`. Para probar la interfaz usar `localhost`: Next.js bloquea HMR desde orígenes no autorizados como `127.0.0.1` al enlazar a `0.0.0.0`. El navegador respeta `HTTPS_PROXY`/`HTTP_PROXY` y mantiene TLS verificado. No se necesitan secretos nuevos.

La red debe permitir descargas de Playwright, Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), Meta y las landings elegidas. El modelo necesita `registry.ollama.ai` y sus destinos de descarga. Meta puede exigir consentimiento/login, bloquear automatización o cambiar el DOM. Cero anuncios extraídos **no demuestra** ausencia de anuncios. No se resuelven CAPTCHA ni se simulan resultados.

```bash
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
# Con npm run dev en otro proceso:
npm run test:integration
# Sólo para pruebas locales cuando falta el navegador fijado de Playwright:
TEST_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:integration
```

Las pruebas de integración incluyen solicitudes reales a las API locales, extracción DOM con ejemplos sintéticos y una prueba de interfaz que intercepta respuestas de búsqueda/verificación exclusivamente dentro de esa prueba. **No certifican búsquedas reales de Meta** ni la instalación del Chromium fijado. El ejecutable alternativo sólo afecta a las pruebas; el scraping de la aplicación continúa usando el navegador de Playwright.

No ejecutar build y dev simultáneamente porque comparten `.next`. Guardar capturas, exportaciones y datos reales fuera del checkout (por ejemplo `/tmp/meta-offer-finder/`); no incorporar datasets ni credenciales.
