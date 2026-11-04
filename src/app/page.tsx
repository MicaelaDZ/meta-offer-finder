
import SearchAds from "./SearchAds";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white md:p-12">
      <div className="mx-auto max-w-6xl">
        <header className="mb-10">
          <p className="mb-2 text-sm font-semibold text-cyan-400">
            META OFFER FINDER
          </p>

          <h1 className="text-3xl font-bold md:text-4xl">
            Explorador de ofertas digitales
          </h1>

          <p className="mt-3 text-slate-400">
            Investigá anuncios activos de Meta en Argentina,
            agrupá ofertas por anunciante y analizá
            posibles productos digitales de venta automática.
          </p>

          <p className="mt-2 text-sm text-slate-500">
            La antigüedad de los anuncios, la cantidad de
            publicidades y las señales de compra son
            indicadores de investigación. No confirman
            ventas, facturación ni rentabilidad.
          </p>
        </header>

        <SearchAds />

        <footer className="mt-12 border-t border-slate-800 pt-6">
          <p className="text-xs text-slate-500">
            Los resultados corresponden a la búsqueda
            realizada durante esta sesión. Las páginas
            detectadas se consideran candidatas hasta
            verificar el proceso de compra y la entrega
            digital.
          </p>
        </footer>
      </div>
    </main>
  );
}
