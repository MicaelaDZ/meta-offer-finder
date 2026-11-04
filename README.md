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

La pantalla conserva **Búsqueda manual** y ofrece **Descubrimiento automático** sin palabra clave ni selección de nicho. Elegí país e idioma y presioná **Descubrir productos**. Se consultan seis categorías (ebooks, cursos, plantillas, imprimibles, packs y software), se eliminan IDs repetidos y se ejecutan las etapas existentes de agrupación, análisis, verificación, asociación y ranking. Los botones manuales y los detalles siguen disponibles.

- Países iniciales: Argentina, México, España, Colombia, Chile, Perú, Uruguay, Brasil, Estados Unidos y Reino Unido. El país es el filtro de distribución de Meta, no el origen del anunciante.
- Idiomas iniciales: español, inglés, portugués o todos. Es una estimación conservadora del texto, independiente del idioma de la interfaz de Meta. El filtro excluye textos desconocidos o ambiguos. No garantiza detección perfecta de textos mixtos. Con “Todos”, las consultas usan el idioma habitual del país; no implica cobertura exhaustiva de todos sus idiomas.
- Se realizan hasta seis búsquedas secuenciales, separadas por 750 ms, con presupuesto de 120 segundos y hasta 100 anuncios únicos. El scraping usa dos desplazamientos por consulta, sin reintentos automáticos. Una sola tarea de navegador por proceso y una pausa de 30 segundos entre descubrimientos evitan acumulaciones locales; no es un limitador distribuido entre servidores.
- Se analizan hasta cinco representantes con Ollama (8 segundos por solicitud), se verifican hasta cinco páginas (40 segundos totales más arranque del navegador) y se genera un ranking aun si esas etapas fallan. El resto queda sin analizar/verificar; nunca se extrapolan esos resultados a todos los anuncios. Cancelar conserva los resultados de etapas completadas.
- Las páginas se consideran candidatas. Una coincidencia exacta de dominio en el texto del anuncio es evidencia de asociación, no prueba de que esa sea la landing de ese anuncio o producto. El ranking exige además IDs del mismo grupo y una respuesta HTTP accesible. Al filtrar por idioma sólo se verifican URLs explícitas del texto retenido; los enlaces globales no se atribuyen a ese idioma.
- La clasificación por reglas busca señales explícitas digitales, de compra y de precio no nulo. Productos físicos, servicios, gratuitos y señales contradictorias no se promocionan como digitales pagos. El resultado sigue siendo un **candidato**, nunca una compra confirmada. Ollama es auxiliar: sus afirmaciones no confirman pagos ni añaden puntos de evidencia.
- No se calculan ventas, ingresos, ROAS ni rentabilidad. Cantidad y antigüedad son sólo las de los anuncios recuperados. El formato de fecha no reconocido queda sin antigüedad.

### Requisitos y desarrollo

Usar el checkout existente; no hace falta crear otro worktree. Node.js compatible con Next.js 16 (entorno validado con Node 24), `npm ci`, `npx playwright install chromium`, Ollama en `127.0.0.1:11434` y el modelo `qwen2.5:7b` (`ollama pull qwen2.5:7b`). Iniciar Ollama y luego `npm run dev`. Para probar la interfaz localmente usar el hostname `localhost`; Next.js bloquea orígenes de desarrollo no autorizados como `127.0.0.1` al enlazar el servidor a `0.0.0.0`. El navegador respeta `HTTPS_PROXY`/`HTTP_PROXY` cuando están configurados y mantiene TLS verificado. No se necesitan secretos nuevos para esta implementación.

La política de red debe permitir las descargas de Playwright, Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`), Meta y los destinos que se quieran verificar. El modelo requiere acceso a `registry.ollama.ai` y sus destinos de descarga. Meta puede exigir consentimiento/login, bloquear automatización o cambiar su DOM. En esos casos se muestran errores o advertencias: cero anuncios extraídos **no demuestra** que no existan anuncios. No se resuelven CAPTCHA ni se simulan resultados.

```bash
npm test                  # pruebas unitarias sin red
npm run lint
npm run build             # requiere descargar las fuentes de Google
npx tsc --noEmit
# Con npm run dev en otro proceso:
npm run test:integration  # solicitudes a las API locales; ejemplos sintéticos sólo de prueba
```

No ejecutar build y dev simultáneamente porque comparten `.next`. Guardar exportaciones, capturas y datos reales de investigación fuera del checkout (por ejemplo `/tmp/meta-offer-finder/`); no se incorporan datasets locales ni credenciales al repositorio.
