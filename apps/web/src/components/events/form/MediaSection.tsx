import { Image, Video } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

export interface MediaValues {
  imageUrl: string;
  videoUrl: string;
}

interface MediaSectionProps {
  idPrefix: string;
  form: MediaValues;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  description?: string;
  imageUrlPlaceholder?: string;
  imageUrlHint?: string;
  videoUrlPlaceholder?: string;
}

export function MediaSection({
  idPrefix,
  form,
  onChange,
  description,
  imageUrlPlaceholder = 'Google Drive link or direct image URL',
  imageUrlHint = 'Supports Google Drive shareable links',
  videoUrlPlaceholder = 'YouTube, Vimeo, or Loom link',
}: MediaSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Image className="h-5 w-5 text-amber-600" />
          Media
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-image-url`} className="text-sm font-medium text-gray-700">Cover Image URL</label>
            <Input
              id={`${idPrefix}-image-url`}
              name="imageUrl"
              type="url"
              value={form.imageUrl}
              onChange={onChange}
              placeholder={imageUrlPlaceholder}
            />
            {imageUrlHint && <p className="text-xs text-gray-500">{imageUrlHint}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor={`${idPrefix}-video-url`} className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <Video className="h-4 w-4" />
              Video URL
            </label>
            <Input
              id={`${idPrefix}-video-url`}
              name="videoUrl"
              type="url"
              value={form.videoUrl}
              onChange={onChange}
              placeholder={videoUrlPlaceholder}
            />
            <p className="text-xs text-gray-500">We convert supported video links into a safe embed URL automatically.</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
