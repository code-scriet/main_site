import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ExternalLink, Loader2 } from 'lucide-react';
import { getPlaygroundLaunchUrl } from '@/lib/playgroundUrl';

function normalizeDate(value?: string) {
  return value ? value.slice(0, 10) : value;
}

export default function QOTDSolvePage() {
  const { date } = useParams();
  const location = useLocation();
  const isToday = location.pathname.endsWith('/today');
  const dateKey = isToday ? 'today' : (normalizeDate(date) ?? 'today');

  const target = useMemo(() => getPlaygroundLaunchUrl(`/?qotd=${encodeURIComponent(dateKey)}`), [dateKey]);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6 text-center">
        <Link
          to="/dashboard"
          className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </Link>
        <div className="rounded-2xl border border-gray-200 bg-white p-10 shadow-sm">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-600" />
          <h1 className="mt-5 text-2xl font-bold text-gray-900">Opening playground…</h1>
          <p className="mt-2 text-sm text-gray-600">
            The Question of the Day now lives inside the playground.
          </p>
          <noscript>
            <p className="mt-3 text-xs text-amber-800">
              JavaScript is disabled in your browser. Use the button below to continue.
            </p>
          </noscript>
          <a
            href={target}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            Continue
            <ExternalLink className="h-4 w-4" />
          </a>
          <div className="mt-5 text-xs text-gray-500">
            <Link to="/qotd/leaderboard" className="font-semibold text-blue-700 hover:text-blue-900">
              View QOTD leaderboard
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
