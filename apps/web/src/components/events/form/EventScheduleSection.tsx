import { Calendar } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface EventScheduleValues {
  startDate: string;
  endDate: string;
  eventDays: string;
}

interface EventScheduleSectionProps {
  idPrefix: string;
  form: EventScheduleValues;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  description?: string;
  endDateHint?: string;
  eventDaysHint?: string;
}

export function EventScheduleSection({
  idPrefix,
  form,
  onChange,
  description,
  endDateHint = 'Leave empty for single-day events',
  eventDaysHint = 'Use more than 1 for multi-day attendance tracking.',
}: EventScheduleSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-amber-600" />
          Event Schedule
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-start-date`} className="text-sm font-medium text-gray-700">
              Event Start Date &amp; Time <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-start-date`}
              name="startDate"
              type="datetime-local"
              value={form.startDate}
              onChange={onChange}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-end-date`} className="text-sm font-medium text-gray-700">Event End Date &amp; Time</label>
            <Input
              id={`${idPrefix}-end-date`}
              name="endDate"
              type="datetime-local"
              value={form.endDate}
              onChange={onChange}
            />
            {endDateHint && <p className="text-xs text-gray-500">{endDateHint}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-days`} className="text-sm font-medium text-gray-700">
              Attendance Days
            </label>
            <Input
              id={`${idPrefix}-days`}
              name="eventDays"
              type="number"
              min="1"
              max="10"
              value={form.eventDays}
              onChange={onChange}
            />
            <p className="text-xs text-gray-500">{eventDaysHint}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
