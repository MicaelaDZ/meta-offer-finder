
"use client";

import { useRef, useState } from "react";
import { COUNTRIES, LANGUAGES, LIMITS } from "../lib/discovery.mjs";
import { deduplicateRanking, sortRanking } from "../lib/ranking.mjs";
import { verificationBatch, CANCELLATION_NOTICE, LANGUAGE_NOTICE } from "../lib/verification.mjs";


export default function SearchAds() {
  const [keyword, setKeyword] = useState("");
  const [mode, setMode] = useState("automatic");
  const [country, setCountry] = useState("AR");
  const [language, setLanguage] = useState("all");
  const [progress, setProgress] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [searches, setSearches] = useState([]);
  const controller = useRef(null);
  const [ads, setAds] = useState([]);
  const [analyses, setAnalyses] = useState({});
  const [groups, setGroups] = useState([]);
  const [externalLinks, setExternalLinks] = useState([]);
  const [verifiedPages, setVerifiedPages] = useState([]);
  const [verificationCursor, setVerificationCursor] = useState(0);
  const [pageMatches, setPageMatches] = useState([]);
  const [ranking, setRanking] = useState([]);

  const [rankingLoading, setRankingLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [grouping, setGrouping] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState("");

  // Controlamos qué listados largos se muestran.
  const [showPages, setShowPages] = useState(false);
  const [showGroups, setShowGroups] = useState(false);
  const [showAds, setShowAds] = useState(false);
  
const [rankingFilter, setRankingFilter] = useState("todos");

const [rankingSort, setRankingSort] = useState("evidencia");


  const busy =
    loading ||
    analyzing ||
    grouping ||
    verifying ||
    rankingLoading;

  async function readResponse(response) {
    const raw = await response.text();

    if (!raw.trim()) {
      throw new Error(
        `La API respondió vacía. HTTP ${response.status}`
      );
    }

    let data;

    try {
      data = JSON.parse(raw);
    } catch {
      throw new Error(
        `La API devolvió una respuesta no válida. HTTP ${response.status}`
      );
    }

    if (!response.ok) {
      const error = new Error(data.error || `Error HTTP ${response.status}`);
      error.details = data;
      throw error;
    }

    return data;
  }

  async function post(path, body, timeout = 55000) {
    return readResponse(await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.any([AbortSignal.timeout(timeout), ...(controller.current ? [controller.current.signal] : [])]),
    }));
  }

  async function automaticPipeline(data) {
    let foundGroups = [], pages = [], matches = [];
    const notes = [];
    async function step(label, action) {
      if (controller.current?.signal.aborted) throw new Error("Exploración cancelada.");
      setProgress(label);
      try { await action(); }
      catch (error) {
        if (controller.current?.signal.aborted) throw new Error("Exploración cancelada.");
        notes.push(`${label}: ${error.message}`);
        setWarnings(previous => [...previous, notes.at(-1)]);
      }
    }
    if (!data.ads?.length) return;
    await step("Agrupando anuncios", async () => {
      const result = await post("/api/group", { ads: data.ads });
      foundGroups = result.groups || [];
      setGroups(foundGroups);
    });
    await step("Analizando hasta 5 anuncios con IA", async () => {
      const representatives = foundGroups.length ? foundGroups.map(group => data.ads.find(ad => ad.id === group.ads[0]?.id)).filter(Boolean) : data.ads;
      const result = await post("/api/analyze", { ads: representatives.slice(0, LIMITS.analyses) });
      setAnalyses(Object.fromEntries((result.results || []).map(item => [item.id, item])));
      const failures = result.results.filter(item => item.error).length;
      if (failures) throw new Error(`${failures} análisis sin resultado. El ranking conserva solamente evidencia observable.`);
    });
    if (data.externalLinks?.length) {
      await step("Verificando hasta 5 páginas candidatas", async () => {
        const result = await post("/api/verify-pages", { urls: data.externalLinks.slice(0, LIMITS.pages) });
        pages = result.results || [];
        setVerifiedPages(pages);
        setVerificationCursor(Math.min(data.externalLinks.length, LIMITS.pages));
        const failures = pages.filter(page => ["error", "no_accesible"].includes(page.status)).length;
        if (failures) throw new Error(`${failures} páginas no se pudieron verificar.`);
      });
      await step("Asociando páginas por URL y nombre de producto", async () => {
        const result = await post("/api/match-pages", { ads: data.ads, pages });
        matches = result.matches || [];
        setPageMatches(matches);
      });
    }
    if (foundGroups.length) await step("Calculando ranking de evidencia", async () => {
      const result = await post("/api/rank", { groups: foundGroups, pages, matches });
      setRanking(result.ranking || []);
    });
  }

  async function searchAds(event) {
    event.preventDefault();
    if (mode === "manual" && !keyword.trim()) return;
    controller.current = new AbortController();
    setLoading(true);
    setError(""); setWarnings([]); setSearches([]);
    setAds([]); setGroups([]); setAnalyses({}); setExternalLinks([]);
    setVerificationCursor(0); setVerifiedPages([]); setPageMatches([]); setRanking([]); setSearched(false);
    setShowPages(false); setShowGroups(false); setShowAds(false);
    setProgress(mode === "automatic" ? "Explorando seis categorías de productos digitales" : "Buscando anuncios");
    try {
      const data = await post(mode === "automatic" ? "/api/discover" : "/api/search", { keyword: keyword.trim(), country, language }, 140000);
      setAds(data.ads || []);
      setExternalLinks(data.externalLinks || []);
      setSearches(data.searches || []);
      setWarnings(data.warnings || []);
      setSearched(true);
      if (mode === "automatic") await automaticPipeline(data);
    } catch (error) {
      setSearches(error.details?.searches || []);
      setError(controller.current?.signal.aborted ? "Exploración cancelada. Sólo se conservan las respuestas ya recibidas; la búsqueda en curso no se recupera." : error.message);
    } finally {
      setProgress(""); setLoading(false); controller.current = null;
    }
  }

  async function groupAds() {
    if (ads.length === 0) return;

    setGrouping(true);
    setError("");
    setGroups([]);
    setRanking([]);

    try {
      const response = await fetch("/api/group", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ads }),
      });

      const data = await readResponse(response);
      setGroups(data.groups || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setGrouping(false);
    }
  }

  async function analyzeAds() {
    if (ads.length === 0) return;

    setAnalyzing(true);
    setError("");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ads: ads.slice(0, LIMITS.analyses),
        }),
      });

      const data = await readResponse(response);
      const mapped = {};

      for (const result of data.results || []) {
        mapped[result.id] = result;
      }

      setAnalyses(mapped);
      if (Object.values(mapped).some(result => result.error)) setError("Algunos anuncios no pudieron analizarse. Consultá sus errores en los detalles.");
    } catch (err) {
      setError(err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function verifyPages() {
    if (externalLinks.length === 0) return;
    setVerifying(true); setError(""); setRanking([]);
    const batch = verificationBatch(externalLinks, verificationCursor);
    const previousPages = batch.start === 0 ? [] : verifiedPages;
    try {
      const result = await post("/api/verify-pages", { urls: batch.urls });
      const allPages = [...previousPages, ...(result.results || [])];
      setVerifiedPages(allPages);
      setVerificationCursor(batch.nextCursor);
      const matchData = await post("/api/match-pages", { ads, pages: allPages });
      setPageMatches(matchData.matches || []);
    } catch (error) { setError(error.message); }
    finally { setVerifying(false); }
  }

  async function generateRanking() {
    if (groups.length === 0) {
      setError("Primero agrupá los anuncios.");
      return;
    }

    setRankingLoading(true);
    setError("");
    setRanking([]);

    try {
      const response = await fetch("/api/rank", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          groups,
          pages: verifiedPages,
          matches: pageMatches,
        }),
      });

      const data = await readResponse(response);
      setRanking(data.ranking || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setRankingLoading(false);
    }
  }

  const analyzedCount = Object.values(analyses).filter(result => !result.error).length;
  const uniqueRanking = deduplicateRanking(ranking);
  
const filteredRanking = uniqueRanking.filter((offer) => {
    if (rankingFilter === "todos") return true;
  
    if (rankingFilter === "digitales") {
      return offer.status === "candidato_digital_pago";
    }
  
    if (rankingFilter === "anuncios") {
      return offer.status === "candidato_por_anuncio";
    }
  
    if (rankingFilter === "otros") return ["posible_producto_fisico", "posible_servicio", "posible_digital_gratuito"].includes(offer.status);
    if (rankingFilter === "revision") {
      return (
        offer.status === "sin_evidencia_suficiente"
      );
    }
  
    return true;
  });
  
  
const sortedRanking = sortRanking(filteredRanking, rankingSort);
const nextPages = verificationBatch(externalLinks, verificationCursor);

  function getPageStatusLabel(status) {
    switch (status) {
      case "candidato_digital_pago":
        return "Candidato digital pago";
      case "posible_servicio":
        return "Posible servicio";
      case "posible_producto_fisico":
        return "Posible producto físico";
      case "posible_digital_gratuito":
        return "Posible digital gratuito";
      case "pendiente":
        return "Pendiente";
      case "no_accesible":
        return "No accesible";
      default:
        return "Error";
    }
  }

  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-semibold">
        Descubrir productos digitales pagos
      </h2>

      <form
        onSubmit={searchAds}
        className="flex flex-col gap-3 sm:flex-row"
      >
        <label className="text-sm">Modo
          <select aria-label="Modo de búsqueda" value={mode} onChange={event => setMode(event.target.value)} disabled={busy} className="block rounded-lg bg-slate-900 p-3">
            <option value="automatic">Descubrimiento automático</option>
            <option value="manual">Búsqueda manual</option>
          </select>
        </label>
        <label className="text-sm">País
          <select aria-label="País" value={country} onChange={event => setCountry(event.target.value)} disabled={busy} className="block rounded-lg bg-slate-900 p-3">
            {Object.entries(COUNTRIES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label className="text-sm">Idioma del anuncio
          <select aria-label="Idioma del anuncio" value={language} onChange={event => setLanguage(event.target.value)} disabled={busy} className="block rounded-lg bg-slate-900 p-3">
            {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        {mode === "manual" && <input aria-label="Palabra clave" type="text" required value={keyword} onChange={event => setKeyword(event.target.value)} placeholder="Ej: recetario digital" maxLength={100} disabled={busy} className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-white" />}
        <button type="submit" disabled={busy} className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50">
          {loading ? "Explorando..." : mode === "automatic" ? "Descubrir productos" : "Buscar"}
        </button>
        {loading && <button type="button" onClick={() => controller.current?.abort()} className="rounded-lg border border-slate-600 p-3">Cancelar</button>}
      </form>
      <p className="mt-3 text-sm text-slate-400">
        La exploración usa seis búsquedas de ebooks, cursos, plantillas, imprimibles, packs y software; no cubre toda la biblioteca.
        Hasta 100 anuncios repartidos entre las seis categorías, 5 análisis con IA y 5 páginas por ejecución automática. La verificación manual permite continuar en lotes de 5.
        Los enlaces sin asociación comprobada permanecen como candidatos.
      </p>
      <p className="mt-2 text-sm text-slate-400">{LANGUAGE_NOTICE}</p>
      <p className="mt-2 text-sm text-slate-400">{CANCELLATION_NOTICE}</p>
      {progress && <p role="status" className="mt-4 text-cyan-300">{progress}…</p>}
      {warnings.length > 0 && <ul className="mt-4 text-amber-300">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul>}
      {searches.length > 0 && <details className="mt-4 text-sm text-slate-300"><summary>Cobertura y errores por categoría ({searches.length}/6 búsquedas)</summary><ul>{searches.map(search => <li key={search.category}>{search.category}: {search.total} anuncios recuperados{search.error ? ` — Error: ${search.error}` : ""}{search.warnings?.map(w => ` — ${w}`).join("")}</li>)}</ul></details>}

      {error && (
        <p className="mt-4 rounded-lg bg-red-950 p-4 text-red-300">
          {error}
        </p>
      )}

      {searched && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <p className="text-slate-300">
            Anuncios recuperados: {ads.length}
          </p>

          {ads.length > 0 && (
            <>
              <button
                type="button"
                onClick={groupAds}
                disabled={busy}
                className="rounded-lg bg-violet-500 px-5 py-3 font-semibold text-white disabled:opacity-50"
              >
                {grouping
                  ? "Agrupando..."
                  : "Analizar antigüedad y anuncios"}
              </button>

              <button
                type="button"
                onClick={analyzeAds}
                disabled={busy}
                className="rounded-lg bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
              >
                {analyzing
                  ? "Analizando con Ollama..."
                  : "Analizar con IA"}
              </button>
            </>
          )}

          {externalLinks.length > 0 && (
            <button
              type="button"
              onClick={verifyPages}
              disabled={busy}
              className="rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-50"
            >
              {verifying
                ? "Verificando páginas..."
                : `${verificationCursor >= externalLinks.length ? "Reiniciar verificación" : verificationCursor > 0 ? "Verificar siguientes páginas" : "Verificar páginas de venta"} (${nextPages.urls.length})`}
            </button>
          )}

          {groups.length > 0 && (
              <button
                type="button"
                onClick={generateRanking}
                disabled={
                  busy
                }
                className="rounded-lg bg-amber-500 px-5 py-3 font-semibold text-slate-950 disabled:opacity-50"
              >
                {rankingLoading
                  ? "Generando ranking..."
                  : "Generar ranking"}
              </button>
            )}
        </div>
      )}

      {searched && (
        <p className="mt-3 text-sm text-slate-400">
          Enlaces externos encontrados:{" "}
          {externalLinks.length}.
          {externalLinks.length === 0 &&
            " Todavía no se encontraron páginas para verificar."}
        </p>
      )}

      {externalLinks.length > 0 && <p className="mt-2 text-sm text-slate-400">Páginas procesadas: {verificationCursor}/{externalLinks.length}. Los errores no equivalen a páginas verificadas.</p>}

      {/* RANKING PRINCIPAL */}

      {ranking.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-4 text-xl font-semibold">
            Ranking equilibrado de oportunidades
          </h3>

          <p className="mb-4 text-sm text-slate-400">
            Puntaje de evidencia observable, no de
            ventas ni rentabilidad. Las ofertas sin
            página verificada permanecen pendientes.
          </p>
          
<div className="mb-5 flex flex-wrap items-center gap-3">
  <label
    htmlFor="ranking-filter"
    className="text-sm text-slate-300"
  >
    Filtrar oportunidades:
  </label>

  <select
    id="ranking-filter"
    value={rankingFilter}
    onChange={(event) =>
      setRankingFilter(event.target.value)
    }
    className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-white"
  >
    <option value="todos">Todas</option>
    <option value="digitales">Digitales pagos</option>
    <option value="anuncios">Candidatos por anuncio</option>
    <option value="otros">Físicos, servicios y gratuitos</option>
    <option value="revision">Sin evidencia suficiente</option>
  </select>

  <span className="text-sm text-cyan-400">
    {filteredRanking.length} oportunidades
  </span>
  
<label
  htmlFor="ranking-sort"
  className="text-sm text-slate-300"
>
  Ordenar por:
</label>

<select
  id="ranking-sort"
  value={rankingSort}
  onChange={(event) =>
    setRankingSort(event.target.value)
  }
  className="rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-white"
>
  <option value="evidencia">Prioridad de evidencia</option>
  <option value="puntaje">Mayor puntaje</option>
  <option value="antiguedad">Mayor antigüedad</option>
  <option value="anuncios">Más anuncios</option>
</select>

</div>


          <div className="space-y-4">
          {sortedRanking.map((offer, index) => (
              <div
                key={offer.groupId || index}
                className="rounded-xl border border-amber-800 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-amber-400">
                      POSICIÓN #{index + 1}
                    </p>

                    <h4 className="mt-1 text-lg font-semibold text-white">
                      {offer.advertiser}
                    </h4>

                    <p className="mt-1 text-sm text-slate-300">
                      {offer.product ||
                        "Producto pendiente de verificar"}
                    </p>
                    {offer.groupedResults > 1 && (
  <p className="mt-2 text-xs text-violet-300">
    {offer.groupedResults} grupos
    del mismo producto unificados
  </p>
)}
                    <p className="mt-2 text-xs text-slate-400">
                      {offer.status ===
                      "candidato_digital_pago"
                        ? "Candidato digital pago con página asociada"
                        : offer.status ===
                            "candidato_por_anuncio"
                          ? "Candidato digital por anuncio — página pendiente"
                          : ["posible_producto_fisico", "posible_servicio", "posible_digital_gratuito"].includes(offer.status) ? getPageStatusLabel(offer.status) : "Sin evidencia suficiente — pendiente de investigación"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-3xl font-bold text-amber-400">
                      {offer.score}/100
                    </p>
                    <p className="text-xs text-slate-400">
                      Puntos de evidencia
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <p>
                    Antigüedad:{" "}
                    {offer.ageDays ?? "Desconocida"}{" "}
                    días
                  </p>

                  <p>
                    Anuncios encontrados:{" "}
                    {offer.adsCount}
                  </p>

                  <p>
                    Compra online:{" "}
                    {offer.hasPurchaseSignal
                      ? "Señal detectada"
                      : "No verificada"}
                  </p>

                  <p>
                    Entrega automática:{" "}
                    {offer.hasDeliverySignal
                      ? "Mencionada"
                      : "No verificada"}
                  </p>
                </div>

                {offer.url && (
                  <a
                    href={offer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm text-cyan-400 hover:underline"
                  >
                    Ver página de venta ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* CONTROLES PARA LOS LISTADOS DETALLADOS */}

      {(verifiedPages.length > 0 ||
        groups.length > 0 ||
        ads.length > 0) && (
        <div className="mt-8 rounded-xl border border-slate-700 bg-slate-900 p-5">
          <h3 className="mb-2 text-lg font-semibold text-white">
            Explorar resultados detallados
          </h3>

          <p className="mb-4 text-sm text-slate-400">
            Los datos siguen disponibles, pero no
            necesitás verlos todos al mismo tiempo.
          </p>

          <div className="flex flex-wrap gap-3">
            {verifiedPages.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setShowPages(!showPages)
                }
                className="rounded-lg border border-blue-700 px-4 py-2 text-sm text-blue-300 hover:bg-blue-950"
              >
                {showPages
                  ? "Ocultar"
                  : "Mostrar"}{" "}
                páginas ({verifiedPages.length})
              </button>
            )}

            {groups.length > 0 && (
              <button
                type="button"
                onClick={() =>
                  setShowGroups(!showGroups)
                }
                className="rounded-lg border border-violet-700 px-4 py-2 text-sm text-violet-300 hover:bg-violet-950"
              >
                {showGroups
                  ? "Ocultar"
                  : "Mostrar"}{" "}
                grupos ({groups.length})
              </button>
            )}

            {ads.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAds(!showAds)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-800"
              >
                {showAds
                  ? "Ocultar"
                  : "Mostrar"}{" "}
                anuncios ({ads.length})
              </button>
            )}
          </div>
        </div>
      )}

      {/* PÁGINAS VERIFICADAS */}

      {showPages && verifiedPages.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-4 text-xl font-semibold">
            Resultados de verificación de páginas
          </h3>

          <p className="mb-4 text-sm text-slate-400">
            Estos resultados muestran señales
            detectadas. No confirman que el checkout
            funcione ni que la entrega sea automática.
          </p>

          <div className="space-y-4">
            {verifiedPages.map((page, index) => {
              const match = pageMatches.find(
                (item) =>
                  item.url === page.finalUrl ||
                  item.url === page.url
              );

              return (
                <div
                  key={`${page.url}-${index}`}
                  className="rounded-xl border border-blue-800 bg-slate-900 p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h4 className="text-lg font-semibold text-white">
                        {page.title ||
                          "Página sin título"}
                      </h4>

                      <a
                        href={
                          page.finalUrl || page.url
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 block break-all text-sm text-cyan-400 hover:underline"
                      >
                        {page.finalUrl || page.url}
                      </a>
                    </div>

                    <span className="rounded-lg bg-amber-900 px-3 py-1 text-sm text-amber-200">
                      {getPageStatusLabel(
                        page.status
                      )}
                    </span>
                  </div>

                  <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-3">
                    <p className="text-sm font-semibold text-violet-400">
                      Asociación con anuncio
                    </p>

                    <p className="mt-1 text-sm text-slate-300">
                      Anunciante:{" "}
                      {match?.advertiser ||
                        "No identificado"}
                    </p>

                    <p className="mt-1 text-xs text-slate-400">
                      {match?.matchStatus ===
                      "coincidencia_url_y_producto"
                        ? "URL de producto explícita y coincidencia de nombre verificadas"
                        : "Todavía no hay evidencia suficiente para asociar esta página"}
                    </p>

                    {match?.matchedAdIds?.length >
                      0 && (
                      <p className="mt-1 text-xs text-slate-400">
                        Anuncios coincidentes:{" "}
                        {
                          match.matchedAdIds
                            .length
                        }
                      </p>
                    )}
                  </div>

                  {page.reason && (
                    <p className="mt-3 text-sm text-red-300">
                      {page.reason}
                    </p>
                  )}

                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    <p>
                      Producto digital:{" "}
                      {page.hasDigitalSignal
                        ? "Sí, hay señales"
                        : "No detectado"}
                    </p>

                    <p>
                      Opción de compra:{" "}
                      {page.hasPurchaseSignal
                        ? "Sí, hay señales"
                        : "No detectada"}
                    </p>

                    <p>
                      Entrega automática:{" "}
                      {page.hasDeliverySignal
                        ? "Mencionada"
                        : "No verificada"}
                    </p>

                    <p>
                      Estado HTTP:{" "}
                      {page.httpStatus ??
                        "No disponible"}
                    </p>
                  </div>

                  <p className="mt-3 text-sm text-slate-300">
                    Precios encontrados:{" "}
                    {page.pricesFound?.length
                      ? page.pricesFound.join(", ")
                      : "Ninguno"}
                  </p>

                  {page.textPreview && (
                    <p className="mt-3 text-sm text-slate-400">
                      {page.textPreview}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* GRUPOS DE ANUNCIOS */}

      {showGroups && groups.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-4 text-xl font-semibold">
            Ofertas agrupadas
          </h3>

          <p className="mb-4 text-slate-400">
            Encontramos {groups.length} grupos de
            anuncios.
          </p>

          <div className="space-y-3">
            {groups.map((group) => (
              <div
                key={group.groupId}
                className="rounded-xl border border-violet-800 bg-slate-900 p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <h4 className="text-lg font-semibold text-white">
                      {group.advertiser}
                    </h4>

                    <p className="mt-2 text-sm text-slate-400">
                      Anuncio más antiguo
                      encontrado:{" "}
                      {group.oldestAdDate ||
                        "Desconocido"}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-xl font-bold text-violet-400">
                      {group.adsCount} anuncios
                    </p>

                    <p className="text-sm text-slate-300">
                      {group.ageDays ?? "?"} días
                    </p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-slate-300">
                  {group.exampleCopy?.slice(
                    0,
                    250
                  )}
                </p>
              </div>
            ))}
          </div>

          <p className="mt-3 text-xs text-slate-400">
            La antigüedad y la cantidad de anuncios
            no confirman ventas ni rentabilidad.
          </p>
        </div>
      )}

      {/* ANUNCIOS INDIVIDUALES */}

      {analyzedCount > 0 && (
        <p className="mt-6 text-sm text-emerald-400">
          {analyzedCount} anuncios analizados con
          Ollama.
        </p>
      )}

      {showAds && ads.length > 0 && (
        <div className="mt-6 space-y-4">
          <h3 className="text-xl font-semibold">
            Anuncios individuales
          </h3>

          {ads.map((ad) => {
            const analysis = analyses[ad.id];

            return (
              <div
                key={ad.id}
                className="rounded-xl border border-slate-800 bg-slate-900 p-5"
              >
                <h4 className="font-semibold text-white">
                  {ad.advertiser ||
                    "Sin anunciante"}
                </h4>

                <p className="mt-1 text-xs text-slate-400">
                  Idioma estimado: {LANGUAGES[ad.language] || "Desconocido"} · {ad.date ||
                    "Fecha no disponible"}
                </p>

                <p className="mt-3 text-sm text-slate-300">
                  {ad.copy || "Sin texto"}
                </p>

                {analysis && (
                  <div className="mt-4 rounded-lg border border-slate-700 bg-slate-950 p-4">
                    <p className="font-semibold text-cyan-400">
                      Análisis de Ollama
                    </p>

                    <p className="mt-2 text-sm">
                      Categoría:{" "}
                      {analysis.categoria ||
                        "Desconocida"}
                    </p>

                    <p className="mt-1 text-sm">
                      Producto:{" "}
                      {analysis.producto ||
                        "Sin identificar"}
                    </p>

                    <p className="mt-1 text-sm">
                      Estado de pago:{" "}
                      {analysis.estadoPago ||
                        "No verificado"}
                    </p>

                    <p className="mt-2 text-sm text-slate-300">
                      {analysis.evidencia ||
                        analysis.motivo ||
                        analysis.error ||
                        "Sin evidencia suficiente"}
                    </p>
                  </div>
                )}

                {ad.sourceUrl && (
                  <a
                    href={ad.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-block text-sm text-cyan-400 hover:underline"
                  >
                    Ver anuncio en Meta ↗
                  </a>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
