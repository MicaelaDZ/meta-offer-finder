import { CATEGORY_LABELS, associatedLanding, partitionOffers } from '../lib/result-presentation.mjs';

export function OfferCard({ offer, group }) {
  const landing = associatedLanding(offer);
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900 p-5">
      <h3 className="text-lg font-semibold">{offer.product || 'Nombre del producto pendiente de verificar'}</h3>
      {!offer.product && group?.exampleCopy && <p className="mt-2 text-sm text-slate-400">Anuncio: «{group.exampleCopy.slice(0, 180)}»</p>}
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div><dt className="text-slate-400">Categoría</dt><dd>{CATEGORY_LABELS[offer.adSignals?.productType] || 'Sin determinar'}</dd></div>
        <div><dt className="text-slate-400">Anunciante</dt><dd>{offer.advertiser || 'No identificado'}</dd></div>
        <div><dt className="text-slate-400">Anuncios observados</dt><dd>{offer.adsCount ?? 'Desconocido'}</dd></div>
        <div><dt className="text-slate-400">Antigüedad observada</dt><dd>{offer.ageDays == null ? 'Desconocida' : `${offer.ageDays} días`}</dd></div>
        <div><dt className="text-slate-400">Estado de verificación</dt><dd>{landing ? 'Landing asociada; señales de pago observadas' : 'Pendiente de verificación del producto y su landing'}</dd></div>
        <div><dt className="text-slate-400">Puntaje de evidencia</dt><dd className="font-semibold text-cyan-300">{Number.isFinite(offer.score) ? `${offer.score}/100` : "No disponible"}</dd></div>
      </dl>
      {landing && <a href={landing} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-cyan-300 hover:underline">Ver landing asociada ↗</a>}
    </article>
  );
}
export default function OfferResults({ offers, groups }) {
  const { paid, pending } = partitionOffers(offers);
  return (
    <div className="mt-8 space-y-8" aria-label="Resultados del descubrimiento">
      <p className="text-sm text-slate-400">El puntaje resume evidencia observable. No mide ventas, facturación ni rentabilidad; tampoco confirma que la compra o la entrega funcionen.</p>
      {[{ id: 'paid', title: 'Candidatos digitales pagos', rows: paid }, { id: 'pending', title: 'Pendientes de verificación', rows: pending }].map(section => (
        <section key={section.id} aria-labelledby={`results-${section.id}`}>
          <h2 id={`results-${section.id}`} className="mb-4 text-xl font-semibold">{section.title} ({section.rows.length})</h2>
          {!section.rows.length && <p className="text-sm text-slate-400">{section.id === 'paid' ? 'Todavía no hay candidatos con una landing asociada y evidencia de pago suficiente.' : 'No hay otros candidatos pendientes en esta búsqueda.'}</p>}
          <div className="space-y-4">{section.rows.map(offer => <OfferCard key={offer.groupId} offer={offer} group={groups.find(group => group.groupId === offer.groupId)} />)}</div>
        </section>
      ))}
    </div>
  );
}
