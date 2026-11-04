
"use client";

import { useRef, useState } from "react";
import OfferResults, { OfferCard } from "./OfferResults";
import { runDiscoveryWorkflow } from "../lib/discovery-workflow.mjs";
import { partitionOffers } from "../lib/result-presentation.mjs";
import { urlSummary } from "../lib/url-extraction.mjs";
import { COUNTRIES, LANGUAGES, LIMITS } from "../lib/discovery.mjs";
import { deduplicateRanking, sortRanking } from "../lib/ranking.mjs";
import { verificationBatch, CANCELLATION_NOTICE, LANGUAGE_NOTICE } from "../lib/verification.mjs";


export default function SearchAds() {
  const [keyword, setKeyword] = useState("");
  const [country, setCountry] = useState("AR");
  const [language, setLanguage] = useState("all");
  const [progress, setProgress] = useState("");
  const [warnings, setWarnings] = useState([]);
  const [sourceUnavailable, setSourceUnavailable] = useState(false);
  const [diagnostics, setDiagnostics] = useState([]);
  const operation = useRef(false);
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
  const [manualResults, setManualResults] = useState(false);
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
      error.status = response.status;
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

  function updateWorkflow(update) {
    if (update.ads) setAds(update.ads);
    if (update.groups) setGroups(update.groups);
    if (update.analyses) setAnalyses(update.analyses);
    if (update.pages) setVerifiedPages(update.pages);
    if (update.matches) setPageMatches(update.matches);
    if (update.ranking) setRanking(update.ranking);
    if (update.verificationCursor !== undefined) setVerificationCursor(update.verificationCursor);
  }

  async function searchAds(event, manual = false) {
    event.preventDefault();
    if (operation.current || (manual && !keyword.trim())) return;
    operation.current = true;
    controller.current = new AbortController();
    setLoading(true); setManualResults(manual);
    setSourceUnavailable(false);
    setError(""); setWarnings([]); setDiagnostics([]); setSearches([]);
    setAds([]); setGroups([]); setAnalyses({}); setExternalLinks([]);
    setVerificationCursor(0); setVerifiedPages([]); setPageMatches([]); setRanking([]); setSearched(false);
    setShowPages(false); setShowGroups(false); setShowAds(false);
    setProgress("Buscando anuncios");
    try {
      const data = await post(manual ? "/api/search" : "/api/discover", { ...(manual ? { keyword: keyword.trim() } : {}), country, language }, 140000);
      setAds(data.ads || []);
      setExternalLinks(data.externalLinks || []);
      setSearches(data.searches || []);
      setDiagnostics(data.warnings || []);
      if (data.sourceDiagnostic) setSourceUnavailable(true);
      if (data.searches?.some(search => search.error)) setWarnings([data.sourceDiagnostic?.message || "Algunas búsquedas no pudieron completarse. Conservamos los resultados disponibles."]);
      setSearched(true);
      if (!manual) await runDiscoveryWorkflow(data, {
        post, signal: controller.current.signal, onProgress: setProgress, onUpdate: updateWorkflow,
        onWarning: (message, detail) => {
          setWarnings(previous => [...new Set([...previous, message])]);
          setDiagnostics(previous => [...previous, detail]);
        },
      });
    } catch (error) {
      if (error.details?.searches) setSearches(error.details.searches);
      setDiagnostics(previous => [...previous, error.message]);
      const source = error.details?.sourceDiagnostic || error.details?.diagnostic;
      if (source) setSourceUnavailable(true);
      setError(controller.current?.signal.aborted
        ? "Exploración cancelada. Sólo se conservan las respuestas ya recibidas; la búsqueda en curso no se recupera."
        : source?.message || (error.status === 429 ? error.message : "No se pudo completar la búsqueda. Revisá el detalle en Opciones avanzadas."));
    } finally {
      setProgress(""); setLoading(false); controller.current = null; operation.current = false;
    }
  }

  async function groupAds() {
    if (operation.current || ads.length === 0) return;
    operation.current = true;

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
      setGrouping(false); operation.current = false;
    }
  }

  async function analyzeAds() {
    if (operation.current || ads.length === 0) return;
    operation.current = true;

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
      setAnalyzing(false); operation.current = false;
    }
  }

  async function verifyPages() {
    if (operation.current || externalLinks.length === 0) return;
    operation.current = true;
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
    finally { setVerifying(false); operation.current = false; }
  }

  async function generateRanking() {
    if (groups.length === 0) {
      setError("Primero agrupá los anuncios.");
      return;
    }

    if (operation.current) return;
    operation.current = true;
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
      setRankingLoading(false); operation.current = false;
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

  const discarded = partitionOffers(uniqueRanking).discarded;
  const urlStats = urlSummary(ads);
  const processedPages = verifiedPages.filter(page => page.lifecycle?.attempted !== false).length;
  const accessiblePages = verifiedPages.filter(page => page.lifecycle?.accessible ?? (page.httpStatus >= 200 && page.httpStatus < 400)).length;
  return (
    <section>
      <form onSubmit={searchAds} className="flex flex-col gap-4 sm:flex-row sm:items-end" aria-label="Descubrimiento automático">
        <label className="flex-1 text-sm">País
          <select aria-label="País" value={country} onChange={event => setCountry(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-900 p-3">
            {Object.entries(COUNTRIES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <label className="flex-1 text-sm">Idioma
          <select aria-label="Idioma del anuncio" value={language} onChange={event => setLanguage(event.target.value)} disabled={busy} className="mt-2 block w-full rounded-lg border border-slate-700 bg-slate-900 p-3">
            {Object.entries(LANGUAGES).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy} className="rounded-lg bg-cyan-500 px-6 py-3 font-semibold text-slate-950 disabled:opacity-50">Descubrir oportunidades</button>
      </form>
      {loading && <div className="mt-5 rounded-lg border border-cyan-900 bg-slate-900 p-4">
        <p role="status" aria-live="polite" className="text-cyan-300">{progress}…</p>
        <button type="button" onClick={() => controller.current?.abort()} className="mt-3 rounded-lg border border-slate-600 px-4 py-2">Cancelar</button>
        <p className="mt-3 text-xs text-slate-400">{CANCELLATION_NOTICE}</p>
      </div>}
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-950 p-4 text-red-300">{error}</p>}
      {sourceUnavailable && <p className="mt-4 text-sm text-slate-300">
        Podés consultar los anuncios manualmente en <a className="text-cyan-300 underline" href={`https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=${country}`} target="_blank" rel="noreferrer">la Biblioteca de anuncios de Meta</a>.
      </p>}
      {warnings.length > 0 && <aside aria-label="Advertencias" className="mt-4 text-sm text-amber-200"><ul className="space-y-2">{warnings.map((warning, i) => <li key={i}>{warning}</li>)}</ul></aside>}
      {ranking.length > 0 && <OfferResults offers={sortedRanking} groups={groups} />}
      {searched && !loading && !ranking.length && <p role="status" className="mt-6 text-slate-300">{ads.length === 0 ? "No se recuperaron anuncios en esta exploración. Esto no confirma que no existan ofertas." : manualResults ? "Búsqueda manual completada. Podés continuar el análisis en Opciones avanzadas." : "Los anuncios recuperados están disponibles en Opciones avanzadas. No se pudo preparar un ranking automático."}</p>}

      <details className="mt-10 rounded-xl border border-slate-700 p-5">
        <summary className="cursor-pointer font-semibold">Opciones avanzadas</summary>
        <div className="mt-5 space-y-5">
          <form onSubmit={event => searchAds(event, true)} className="flex flex-col gap-3 sm:flex-row" aria-label="Búsqueda manual">
            <input aria-label="Palabra clave" type="text" required value={keyword} onChange={event => setKeyword(event.target.value)} maxLength={100} disabled={busy} placeholder="Ej: recetario digital" className="flex-1 rounded-lg border border-slate-700 bg-slate-900 px-4 py-3" />
            <button type="submit" disabled={busy} className="rounded-lg border border-cyan-600 px-5 py-3 disabled:opacity-50">Buscar</button>
          </form>
          <p className="text-sm text-slate-400">La búsqueda por palabra clave también usa acceso automatizado y aplica el país y el idioma seleccionados arriba.</p>
          <p className="text-sm text-slate-400">{LANGUAGE_NOTICE}</p>
          <p className="text-sm text-slate-400">{CANCELLATION_NOTICE}</p>
          <p className="text-sm text-slate-400">El modo automático explora seis categorías, hasta 100 anuncios, 5 análisis con IA y 5 páginas. La verificación manual continúa en lotes de 5. La cantidad y antigüedad de anuncios no confirman ventas.</p>
          {searches.length > 0 && <div><h2 className="font-semibold">Cobertura y errores por categoría ({searches.length}/6 búsquedas)</h2><ul className="text-sm text-slate-400">{searches.map(search => <li key={search.category}>{search.category}: {search.total} anuncios recuperados{search.error ? ` — ${search.error}` : ""}{search.warnings?.map(w => ` — ${w}`).join("")}</li>)}</ul></div>}
          {ads.length > 0 && <div className="text-sm text-slate-400"><h2 className="font-semibold">Extracción de URLs por anuncio</h2><p>Sin contenedor inequívoco: {urlStats.scope_unresolved}. Sin URL visible: {urlStats.no_visible_url}. URL presente no extraída: {urlStats.url_present_not_extracted}. Extraída: {urlStats.url_extracted}. Meta/social/contacto: {urlStats.meta_or_non_commercial_url}. URLs externas únicas atribuibles: {urlStats.uniqueExternalUrls}.</p></div>}
          {searches.some(search => search.diagnostic || search.diagnostics?.length) && <div className="text-sm text-slate-400"><h2 className="font-semibold">Diagnóstico técnico de búsquedas</h2><ul>{searches.flatMap(search => (search.diagnostic ? [search.diagnostic] : search.diagnostics || []).map((detail, i) => <li key={`${search.category}-${i}`}>{search.category}: {detail.code}, etapa {detail.stage}{detail.httpStatus ? `, HTTP ${detail.httpStatus}` : ''}{detail.markerCount !== undefined ? `, identificadores ${detail.markerCount}, tarjetas ${detail.cardCount}, contenedores no resueltos ${detail.scopeFailures}` : ''}{detail.elapsedMs !== undefined ? `, ${detail.elapsedMs} ms` : ''}.</li>))}</ul></div>}
          {diagnostics.length > 0 && <div><h2 className="font-semibold">Diagnósticos</h2><ul className="text-sm text-slate-400">{diagnostics.map((detail, i) => <li key={i}>{detail}</li>)}</ul></div>}
          {ranking.length > 0 && <div className="flex flex-wrap gap-3">
            <label>Filtrar oportunidades:<select aria-label="Filtrar oportunidades" value={rankingFilter} onChange={event => setRankingFilter(event.target.value)} className="ml-2 rounded bg-slate-900 p-2"><option value="todos">Todas</option><option value="digitales">Digitales pagos</option><option value="anuncios">Candidatos por anuncio</option><option value="revision">Sin evidencia suficiente</option><option value="otros">Descartados</option></select></label>
            <label>Ordenar por:<select aria-label="Ordenar por" value={rankingSort} onChange={event => setRankingSort(event.target.value)} className="ml-2 rounded bg-slate-900 p-2"><option value="evidencia">Prioridad de evidencia</option><option value="puntaje">Mayor puntaje</option><option value="antiguedad">Mayor antigüedad</option><option value="anuncios">Más anuncios</option></select></label>
          </div>}
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

      {externalLinks.length > 0 && <p className="mt-2 text-sm text-slate-400">Páginas procesadas: {processedPages}/{externalLinks.length}. Accesibles: {accessiblePages}. Asociadas a productos digitales pagos: {uniqueRanking.filter(offer => offer.verification?.digitalPaidVerified).length}. Lote recorrido: {verificationCursor}/{externalLinks.length}. Los errores no equivalen a páginas verificadas.</p>}


          {discarded.length > 0 && <section aria-label="Productos descartados"><h2 className="mb-3 text-lg font-semibold">Productos descartados ({discarded.length})</h2><p className="mb-3 text-sm text-slate-400">Señales de producto físico, servicio o recurso gratuito; no se presentan como oportunidades digitales pagas.</p><div className="space-y-3">{discarded.map(offer => <div key={offer.groupId}><p className="text-sm text-slate-400">{getPageStatusLabel(offer.status)}</p><OfferCard offer={offer} group={groups.find(group => group.groupId === offer.groupId)} /></div>)}</div></section>}
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

                {ad.urlDiagnostics && <p className="mt-2 text-xs text-slate-400">Extracción de URL: {ad.urlDiagnostics.status}. Destinos extraídos: {ad.urlDiagnostics.extracted}. Fuentes inspeccionadas: {ad.urlDiagnostics.visibleTargets}.</p>}

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

        </div>
      </details>
    </section>
  );
}
