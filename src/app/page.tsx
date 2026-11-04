import SearchAds from "./SearchAds";

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 p-6 text-white md:p-12">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-8 text-3xl font-bold md:text-4xl">Descubridor de productos digitales</h1>
        <SearchAds />
      </div>
    </main>
  );
}
