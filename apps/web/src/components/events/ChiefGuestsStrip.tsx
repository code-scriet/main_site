import { Link } from 'react-router-dom';
import type { EventGuestSummary } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { processImageUrl } from '@/lib/imageUtils';
import { User } from 'lucide-react';

interface ChiefGuestsStripProps {
  guests: EventGuestSummary[];
}

export default function ChiefGuestsStrip({ guests }: ChiefGuestsStripProps) {
  if (guests.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">Featured guests</p>
          <h2 className="mt-1 text-2xl font-semibold text-gray-900">Chief Guests & Speakers</h2>
        </div>
        <Badge className="hidden bg-amber-100 text-amber-900 sm:inline-flex">
          {guests.length} confirmed
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {guests.map((guest) => {
          const image = guest.photo ? processImageUrl(guest.photo, 'square') : null;
          const content = (
            <Card className="h-full overflow-hidden border-amber-200 bg-gradient-to-br from-white via-amber-50/70 to-amber-100/70 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <CardContent className="flex items-center gap-4 p-5">
                {image ? (
                  <img src={image} alt={guest.name} className="h-16 w-16 rounded-2xl object-cover shadow-sm" />
                ) : (
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                    <User className="h-7 w-7" />
                  </div>
                )}
                <div className="min-w-0">
                  <Badge variant="outline" className="border-amber-300 bg-white/80 text-amber-900">
                    {guest.role}
                  </Badge>
                  <h3 className="mt-2 truncate text-lg font-semibold text-gray-900">{guest.name}</h3>
                  <p className="truncate text-sm text-gray-600">{guest.designation}</p>
                  <p className="truncate text-sm text-gray-500">{guest.company}</p>
                </div>
              </CardContent>
            </Card>
          );

          if (guest.networkSlug) {
            return (
              <Link key={`${guest.name}-${guest.networkSlug}`} to={`/network/${guest.networkSlug}`}>
                {content}
              </Link>
            );
          }

          return <div key={`${guest.name}-${guest.role}`}>{content}</div>;
        })}
      </div>
    </section>
  );
}
