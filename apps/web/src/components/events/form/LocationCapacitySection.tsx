import { MapPin, Users } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface LocationCapacityValues {
  location: string;
  venue: string;
  capacity: string;
  targetAudience: string;
  prerequisites: string;
}

interface LocationCapacitySectionProps {
  idPrefix: string;
  form: LocationCapacityValues;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement>;
  description?: string;
  locationPlaceholder?: string;
  venuePlaceholder?: string;
  capacityLabel?: string;
  targetAudiencePlaceholder?: string;
  prerequisitesPlaceholder?: string;
}

export function LocationCapacitySection({
  idPrefix,
  form,
  onChange,
  description,
  locationPlaceholder = 'e.g., Online / Campus / City Name',
  venuePlaceholder = 'e.g., Room 101 / Zoom / Google Meet',
  capacityLabel = 'Maximum Capacity',
  targetAudiencePlaceholder = 'e.g., Beginners, 2nd Year Students, etc.',
  prerequisitesPlaceholder = 'What should participants know or bring? e.g., Basic programming knowledge, Laptop required',
}: LocationCapacitySectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5 text-amber-600" />
          Location &amp; Capacity
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-location`} className="text-sm font-medium text-gray-700">Location</label>
            <Input
              id={`${idPrefix}-location`}
              name="location"
              value={form.location}
              onChange={onChange}
              placeholder={locationPlaceholder}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-venue`} className="text-sm font-medium text-gray-700">Venue</label>
            <Input
              id={`${idPrefix}-venue`}
              name="venue"
              value={form.venue}
              onChange={onChange}
              placeholder={venuePlaceholder}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-capacity`} className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Users className="h-4 w-4" />
              {capacityLabel}
            </label>
            <Input
              id={`${idPrefix}-capacity`}
              name="capacity"
              type="number"
              min="1"
              value={form.capacity}
              onChange={onChange}
              placeholder="Leave empty for unlimited"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-target-audience`} className="text-sm font-medium text-gray-700">Target Audience</label>
            <Input
              id={`${idPrefix}-target-audience`}
              name="targetAudience"
              value={form.targetAudience}
              onChange={onChange}
              placeholder={targetAudiencePlaceholder}
            />
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-prerequisites`} className="text-sm font-medium text-gray-700">Prerequisites</label>
          <textarea
            id={`${idPrefix}-prerequisites`}
            name="prerequisites"
            value={form.prerequisites}
            onChange={onChange}
            placeholder={prerequisitesPlaceholder}
            className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </CardContent>
    </Card>
  );
}
