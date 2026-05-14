import { Calendar, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export type EventStatusValue = 'UPCOMING' | 'ONGOING' | 'PAST';

interface EventStatusSectionProps {
  idPrefix: string;
  status: EventStatusValue;
  featured: boolean;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLSelectElement>;
}

export function EventStatusSection({
  idPrefix,
  status,
  featured,
  onChange,
}: EventStatusSectionProps) {
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-600" />
          Event Status
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-status`} className="text-sm font-medium text-gray-700">Status</label>
            <select
              id={`${idPrefix}-status`}
              name="status"
              value={status}
              onChange={onChange}
              className="h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              <option value="UPCOMING">Upcoming</option>
              <option value="ONGOING">Ongoing</option>
              <option value="PAST">Past</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="featured"
              name="featured"
              checked={featured}
              onChange={onChange}
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
            />
            <label htmlFor="featured" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Featured
            </label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
