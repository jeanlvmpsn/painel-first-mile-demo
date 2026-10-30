export default function Carregando() {
  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-7xl px-4 py-8" aria-busy="true" aria-live="polite">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-700" />
          Carregando a aba… (lendo as planilhas)
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-white" />
          ))}
        </div>
        <div className="mt-5 h-72 animate-pulse rounded-2xl border border-slate-200 bg-white" />
      </main>
    </div>
  );
}
