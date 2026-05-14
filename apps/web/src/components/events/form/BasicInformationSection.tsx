import { FileText, Star } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { eventTypes } from '@/lib/eventForm';

export interface BasicInformationValues {
  title: string;
  shortDescription: string;
  description: string;
  eventType: string;
  featured: boolean;
}

interface BasicInformationSectionProps {
  idPrefix: string;
  form: BasicInformationValues;
  onChange: React.ChangeEventHandler<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>;
  description?: string;
  /** Show the Featured checkbox in this section. EditEvent renders it in EventStatusSection instead. */
  showFeatured?: boolean;
  titlePlaceholder?: string;
  shortDescriptionPlaceholder?: string;
  descriptionPlaceholder?: string;
  shortDescriptionLabelHint?: string;
}

export function BasicInformationSection({
  idPrefix,
  form,
  onChange,
  description,
  showFeatured = false,
  titlePlaceholder,
  shortDescriptionPlaceholder,
  descriptionPlaceholder,
  shortDescriptionLabelHint = '(max 300 chars)',
}: BasicInformationSectionProps) {
  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-600" />
          Basic Information
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2 space-y-2">
            <label htmlFor={`${idPrefix}-title`} className="text-sm font-medium text-gray-700">
              Title <span className="text-red-500">*</span>
            </label>
            <Input
              id={`${idPrefix}-title`}
              name="title"
              value={form.title}
              onChange={onChange}
              placeholder={titlePlaceholder}
              required
            />
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-type`} className="text-sm font-medium text-gray-700">Event Type</label>
            <select
              id={`${idPrefix}-type`}
              name="eventType"
              value={form.eventType}
              onChange={onChange}
              className="w-full h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            >
              {eventTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-short-description`} className="text-sm font-medium text-gray-700">
            Short Description <span className="text-gray-400">{shortDescriptionLabelHint}</span>
          </label>
          <textarea
            id={`${idPrefix}-short-description`}
            name="shortDescription"
            value={form.shortDescription}
            onChange={onChange}
            placeholder={shortDescriptionPlaceholder}
            maxLength={300}
            className="w-full min-h-[80px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
          <p className="text-xs text-gray-500 text-right">{form.shortDescription.length}/300</p>
        </div>

        <div className="space-y-2">
          <label htmlFor={`${idPrefix}-description`} className="text-sm font-medium text-gray-700">
            Full Description <span className="text-red-500">*</span>
          </label>
          <textarea
            id={`${idPrefix}-description`}
            name="description"
            value={form.description}
            onChange={onChange}
            placeholder={descriptionPlaceholder}
            className="w-full min-h-[150px] px-3 py-2 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
            required
          />
        </div>

        {showFeatured && (
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="featured"
              name="featured"
              checked={form.featured}
              onChange={onChange}
              className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500"
            />
            <label htmlFor="featured" className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Star className="h-4 w-4 text-amber-500" />
              Featured Event <span className="text-gray-400">(will be highlighted)</span>
            </label>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
