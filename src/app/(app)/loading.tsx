export default function Loading() {
  return (
    <div className="mx-auto max-w-[920px] px-5 pt-10 sm:px-8 lg:pt-14" aria-busy aria-label="Loading">
      <div className="skeleton h-10 w-56" />
      <div className="skeleton mt-4 h-4 w-80" />
      <div className="mt-12 space-y-8">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="grid grid-cols-[56px_1fr] gap-4">
            <div className="skeleton h-12" />
            <div className="space-y-2.5">
              <div className="skeleton h-6 w-1/2" />
              <div className="skeleton h-4 w-full" />
              <div className="skeleton h-[5px] w-[520px] max-w-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
