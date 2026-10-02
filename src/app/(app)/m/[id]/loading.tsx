export default function Loading() {
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(440px,0.9fr)]" aria-busy aria-label="Loading meeting">
      <div className="px-5 pt-10 sm:px-8 lg:px-12">
        <div className="skeleton mb-6 h-3 w-20" />
        <div className="skeleton h-10 w-2/3" />
        <div className="skeleton mt-4 h-4 w-72" />
        <div className="skeleton mt-6 h-5 w-full max-w-[60ch]" />
        <div className="skeleton mt-2 h-5 w-5/6 max-w-[56ch]" />
        <div className="mt-12 space-y-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2.5">
              <div className="skeleton h-6 w-56" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-4 w-11/12" />
              <div className="skeleton h-4 w-4/5" />
            </div>
          ))}
        </div>
      </div>
      <aside className="hidden h-screen border-l border-rule bg-card/50 p-5 lg:block">
        <div className="flex items-center gap-3">
          <div className="skeleton h-10 w-10 rounded-full" />
          <div className="skeleton h-4 w-28" />
        </div>
        <div className="mt-6 space-y-[3px]">
          {Array.from({ length: 7 }, (_, i) => <div key={i} className="skeleton h-[11px]" />)}
        </div>
        <div className="mt-8 space-y-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-4" style={{ width: `${70 + ((i * 37) % 30)}%` }} />)}
        </div>
      </aside>
    </div>
  );
}
