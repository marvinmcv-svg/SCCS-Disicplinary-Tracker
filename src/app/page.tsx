'use client';

// SCCS Discipline Tracker — the original React SPA (HashRouter, see
// sccs/client/src/App.tsx) mounted as the single sandbox route. Client-only:
// the app reads localStorage/window at module scope.
import dynamic from 'next/dynamic';

const SpaApp = dynamic(() => import('@/spa/App'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f5f5f7] dark:bg-black">
      <div className="flex flex-col items-center gap-3">
        <img src="/sccs.png" alt="SCCS logo" className="h-16 w-16 rounded-xl object-cover" />
        <div className="text-sm font-medium text-[#6e6e73] dark:text-[#a1a1a6]">Loading SCCS Discipline Tracker…</div>
      </div>
    </div>
  ),
});

export default function Home() {
  return <SpaApp />;
}
