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

The application uses local system fonts: Arial/Helvetica for body text and a system monospace stack for code. Builds and browsers do not download fonts from Google or another font provider. Font rendering can vary slightly by operating system.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Descubrimiento automático

La pantalla principal muestra **Descubridor de productos digitales**, país, idioma y un único botón: **Descubrir oportunidades**. No pide palabras clave ni conocimientos de nichos. Una sola acción recorre las seis categorías, deduplica, agrupa, calcula antigüedad/cantidad, intenta el análisis con IA, verifica páginas, comprueba la asociación de productos y prepara el ranking.

El progreso usa cuatro mensajes: **Buscando anuncios**, **Analizando ofertas**, **Verificando páginas** y **Preparando resultados**. Si Ollama no está disponible o falla, se muestra una advertencia y continúan las etapas de evidencia observable. El ranking no usa respuestas inventadas ni depende de la IA. La interfaz bloquea una segunda ejecución mientras la primera está en curso y permite cancelar con el alcance de retención explicado en pantalla.

Los resultados separan **Candidatos digitales pagos** con landing asociada de **Pendientes de verificación**. Las tarjetas muestran el nombre de la landing asociada o un nombre probable extraído del anuncio, etiquetado como inferido, categoría observable, anunciante, anuncios recuperados, antigüedad, verificación y puntaje. Sólo enlazan una landing cuando el ranking ha comprobado su asociación. El puntaje no representa ventas, ingresos ni rentabilidad.

**Opciones avanzadas**, cerrada inicialmente, conserva la búsqueda manual, los botones de agrupación/antigüedad, IA, verificación por lotes y ranking, los descartados, filtros, orden y diagnósticos. La búsqueda manual usa los selectores de país e idioma de la pantalla principal.

### Exactitud comercial

- Un candidato pago necesita una única oferta digital, una acción de compra y un precio positivo ligado al producto en la misma cláusula. En landings se admite además una sección DOM de producto único con `h1`, precio actual identificado y botón de compra; títulos o precios de varios productos se mantienen pendientes. Precios anteriores/habituales, regalos, varios productos, contradicciones y texto incompleto permanecen pendientes de revisión. No se toma cualquier precio del anuncio o de la página.
- El extractor de navegador excluye precios dentro de `del`, `s`, `strike`, texto oculto y estilos computados de tachado. Si el precio anterior está expresado en palabras, la oferta queda pendiente. No se interpretan precios de imágenes, vídeos o estilos de tachado que el DOM no permita identificar: requiere revisión humana.
- Una landing sólo aporta puntos cuando la URL solicitada coincide exactamente con un destino observado en el texto o CTA de una tarjeta inequívoca del anuncio, conservando parámetros y fragmento, coincide el tipo digital y al menos dos palabras distintivas del nombre del producto con un único `h1` visible. Una redirección sólo se acepta desde un CTA atribuido al anuncio, con cadena HTTP registrada y continua y el mismo producto en destino. También requiere respuesta HTTP accesible y evidencia actual de pago. Compartir dominio no basta. No se confía en estados ni asociaciones reenviados por el cliente: el ranking los recalcula.
- La asociación es evidencia conservadora, no prueba de compra, checkout operativo o entrega. Sin URL/nombre suficiente, el anuncio conserva su candidatura y no recibe puntos de la landing. URLs de seguimiento sin cadena comprobable o anuncios sin contenedor inequívoco permanecen pendientes.
- No se calculan ventas, ingresos, ROAS ni rentabilidad. Ollama es auxiliar; sus afirmaciones no confirman pagos ni otorgan puntos. El orden predeterminado prioriza evidencia; sólo cambia si el usuario elige puntaje, antigüedad o cantidad de anuncios.

### Presupuestos e identidad

- Las seis categorías (ebooks, cursos, plantillas, imprimibles, packs y software) tienen cuotas de nuevos IDs de **17/17/17/17/16/16**. Ninguna categoría puede ocupar todo el cupo de 100 anuncios. Cada consulta recibe una porción del tiempo restante para reservar oportunidades a las demás, hasta 18 segundos por consulta y 120 segundos totales. Cancelación, desconexión o un fallo fuera del presupuesto pueden impedir completar todas; se informa cobertura y errores.
- Se realizan búsquedas secuenciales con pausas de 750 ms. Hay una sola tarea de navegador por proceso y una pausa de 30 segundos entre descubrimientos. No es un limitador distribuido entre servidores.
- Se conservan la versión más completa de cada ID, sus datos complementarios, categorías y observaciones originales. Versiones contradictorias quedan marcadas para revisión. Las categorías posteriores pueden completar IDs ya encontrados aunque se haya usado su cuota de nuevos anuncios.
- Agrupar requiere identidad explícita del producto. Se admite texto completo idéntico y URLs de producto coincidentes, o creatividades distintas con un único destino idéntico, nombre inferido y tipo coincidentes, igual precio y sin contradicciones. Sin identidad suficiente, cada ID permanece separado. No se agrupa por introducción, anunciante o dominio. El ranking no unifica productos por URLs sin parámetros ni fusiona grupos distintos por compartir landing.
- El modo automático realiza hasta cinco análisis con Ollama y verifica hasta cinco páginas. El modo manual permite **continuar en lotes de cinco** y reiniciar después del último lote. Errores de páginas no equivalen a verificaciones exitosas.
- La búsqueda manual conserva cuatro desplazamientos de 1,5 segundos, hasta 60 segundos de navegación y 15 segundos esperando identificadores, con presupuesto total de 100 segundos. La automática usa dos desplazamientos y esperas menores por su presupuesto entre categorías. Las respuestas están acotadas a 100 anuncios y hasta 100 enlaces manuales; no cubren toda la biblioteca.

### Texto, idiomas y cancelación

- Países iniciales: Argentina, México, España, Colombia, Chile, Perú, Uruguay, Brasil, Estados Unidos y Reino Unido. El país es un filtro de distribución de Meta, no el origen del anunciante.
- Idiomas: español, inglés, portugués o todos. Es una estimación heurística del texto, independiente del país y de la interfaz de Meta; puede fallar en textos breves o mixtos. Los desconocidos se excluyen al filtrar. “Todos” no filtra, pero las semillas usan el idioma habitual del país y no garantizan cobertura multilingüe.
- Se conserva el texto de cada sección de anuncio, sin el antiguo corte a once líneas. Más de 20.000 caracteres o un marcador visible de “ver más” se consideran texto incompleto y no habilitan clasificación paga. El límite de extracción de páginas es 100.000 caracteres; si se excede tampoco se habilita evidencia paga. Los formatos de fecha no reconocidos mantienen antigüedad desconocida.
- Cancelar detiene nuevas solicitudes. **Sólo se conservan respuestas ya recibidas**: los anuncios acumulados en una búsqueda cuya respuesta todavía no llegó no se recuperan al cancelarla.

### Requisitos y comprobaciones

Usar el checkout existente; no hace falta otro worktree. Node.js compatible con Next.js 16 (entorno validado con Node 24), `npm ci`, `npx playwright install chromium`, Ollama opcional en `127.0.0.1:11434` y `ollama pull qwen2.5:7b` para habilitar el análisis con IA. Iniciar `npm run dev`; sin Ollama se continúa con evidencia observable. Para probar la interfaz usar `localhost`: Next.js bloquea HMR desde orígenes no autorizados como `127.0.0.1` al enlazar a `0.0.0.0`. El navegador respeta `HTTPS_PROXY`/`HTTP_PROXY` y mantiene TLS verificado. No se necesitan secretos nuevos.

La red debe permitir descargas de Playwright, Meta y las landings elegidas. El modelo necesita `registry.ollama.ai` y sus destinos de descarga. Meta puede exigir consentimiento/login, bloquear automatización o cambiar el DOM. Cero anuncios extraídos **no demuestra** ausencia de anuncios. No se resuelven CAPTCHA ni se simulan resultados.

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

Las pruebas de integración incluyen solicitudes reales a las API locales, extracción DOM con ejemplos sintéticos y pruebas de interfaz de una sola acción, IA disponible/no disponible, error de búsqueda, prevención de doble ejecución, cancelación y verificación manual en lotes. Las respuestas de búsqueda, IA y páginas externas se interceptan exclusivamente dentro de esas pruebas; agrupación, asociación y ranking recorren las API reales locales. **No certifican búsquedas reales de Meta** ni la instalación del Chromium fijado. El ejecutable alternativo sólo afecta a las pruebas; el scraping de la aplicación continúa usando el navegador de Playwright.

No ejecutar build y dev simultáneamente porque comparten `.next`. Guardar capturas, exportaciones y datos reales fuera del checkout (por ejemplo `/tmp/meta-offer-finder/`); no incorporar datasets ni credenciales.

## Diagnóstico de extracción y verificación

La extracción ahora inspecciona cada tarjeta con identificador explícito de biblioteca. Soporta `href`, `data-href`, `data-url` y `data-lynx-uri`, incluyendo el destino `u` de `l.facebook.com`, `lm.facebook.com` y `/l.php`. Conserva el ID del anuncio y la fuente DOM. No atribuye enlaces globales a una tarjeta ni ejecuta `onclick`, scripts opacos, CAPTCHA o interacciones de compra. Tampoco convierte dominios sueltos en URLs supuestas.

El filtro de idioma conserva los CTA de las tarjetas retenidas. Se eliminó el recorte de cuatro enlaces por búsqueda; se priorizan enlaces atribuibles de los anuncios retenidos y se conservan hasta 100 URLs únicas. El límite de **cinco páginas automáticas por ejecución** se mantiene: tener 6 URLs y recorrer 5 no significa que haya cinco productos verificados. Las restantes continúan desde Opciones avanzadas en lotes.

En **Opciones avanzadas** se muestran contadores por anuncio: `no_visible_url`, `url_present_not_extracted`, `url_extracted`, `meta_or_non_commercial_url` y `scope_unresolved`. Un CTA sin destino inspeccionable no equivale a una URL comercial. Cada búsqueda incluye código técnico, etapa, HTTP cuando existe, identificadores/tarjetas encontradas y tiempo; ya no se resume todo como un error de extracción indistinto.

Cada resultado muestra por separado URL encontrada, página descargada, accesibilidad, asociación de producto, evidencia digital, precio/pago actual y verificación comercial por evidencia. Un HTTP 403 puede estar descargado pero no accesible. Una página accesible puede carecer de precio o no ser el producto anunciado. Las tarjetas pendientes muestran su causa específica. “Verificado por evidencia” no prueba una transacción, ventas ni entrega.

Los nombres son heurísticos e inferidos hasta asociar una landing; la categoría surge del texto del producto, nunca de la categoría usada para encontrar el anuncio. Un curso hallado por “imprimibles” sigue siendo un curso cuando su texto lo identifica. Sin señales suficientes no se inventa un nombre, categoría ni puntaje.

Ollama conserva el timeout de 8 segundos por solicitud. El primer timeout, fallo de conexión o modelo ausente corta el resto del lote para no consumir cinco veces la misma espera. Los análisis omitidos no se fabrican y las landings/ranking siguen adelante. La cancelación del cliente también se propaga al modelo.

### Cómo comprobarlo en tu computadora

```bash
git fetch origin
git switch codex/improve-landing-extraction
npm ci
npx playwright install chromium
npm test
npm run lint
npx tsc --noEmit --incremental false
npm run build
# En otra terminal, después del build:
npm run dev
# Diagnóstico de las dos búsquedas reportadas, una por vez:
node scripts/diagnose-meta.mjs --category ebooks --country AR --language es
node scripts/diagnose-meta.mjs --category cursos --country AR --language es
# Con el servidor activo:
npm run test:integration
```

Elegí país/idioma y ejecutá el descubrimiento; revisá los contadores y causas en Opciones avanzadas y las etapas de cada tarjeta. Usá la continuación manual para las URLs fuera del primer lote. Para activar IA, iniciar `ollama serve` y descargar `qwen2.5:7b`; no es requisito para el ranking.

El script de diagnóstico imprime únicamente categoría, contadores y códigos/etapas/tiempos. No imprime texto de anuncios, URLs completas ni parámetros, cookies, credenciales, HTML o trazas. El extractor conserva URLs completas sólo como datos operativos para navegar y distinguir productos; no las vuelca a logs. Evitá activar logs de protocolo/HAR si vas a compartir la salida.

### Qué se pudo comprobar

Las pruebas incluyen un DOM sintético de 55 anuncios con 55 CTA distintos y filtro español, los atributos y wrappers soportados, aislamiento de enlaces globales, redirecciones HTTP observadas con servidor local, fallos de acceso y páginas con precio separado del título. No son anuncios reales ni demuestran una tasa de recuperación real en Meta.

Desde el entorno de desarrollo, el intento de acceso a Meta respondió `403 Forbidden` del proxy y falta el Chromium fijado del scraper. Por eso no se pudo inspeccionar el HTML real de tu ejecución ni determinar la causa concreta de los fallos de ebooks y cursos. Los formatos DOM cambiantes, destinos detrás de acciones opacas y recursos no renderizados pueden seguir pendientes. Los nuevos diagnósticos permiten comprobar esos casos localmente sin atribuirles una causa inventada.
