import { FileText, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { EventRegistrationField, EventRegistrationFieldType } from '@/lib/api';
import { registrationFieldTypes } from '@/lib/eventForm';

interface ExtraRegistrationFieldsSectionProps {
  /** Unique prefix used to build accessible label/input ids ("create-event" / "edit-event"). */
  idPrefix: string;
  fields: EventRegistrationField[];
  onAdd: () => void;
  onUpdate: (index: number, patch: Partial<EventRegistrationField>) => void;
  onRemove: (index: number) => void;
  description?: string;
  emptyMessage?: string;
}

export function ExtraRegistrationFieldsSection({
  idPrefix,
  fields,
  onAdd,
  onUpdate,
  onRemove,
  description,
  emptyMessage = 'No extra fields configured. Users will register directly without a popup form.',
}: ExtraRegistrationFieldsSectionProps) {
  return (
    <Card className="border-amber-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-amber-600" />
          Extra Registration Fields
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">
        {fields.length === 0 ? (
          <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-4 text-sm text-amber-800">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-4">
            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-amber-200 p-4 space-y-4 bg-amber-50/30">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-amber-900">Field {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onRemove(index)}
                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove
                  </Button>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="sm:col-span-2 space-y-2">
                    <label htmlFor={`${idPrefix}-registration-field-name-${field.id}`} className="text-sm font-medium text-gray-700">
                      Field Name <span className="text-red-500">*</span>
                    </label>
                    <Input
                      id={`${idPrefix}-registration-field-name-${field.id}`}
                      value={field.label}
                      onChange={(e) => onUpdate(index, { label: e.target.value })}
                      placeholder="e.g., GitHub Profile URL"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={`${idPrefix}-registration-field-type-${field.id}`} className="text-sm font-medium text-gray-700">Type</label>
                    <select
                      id={`${idPrefix}-registration-field-type-${field.id}`}
                      value={field.type}
                      onChange={(e) => onUpdate(index, { type: e.target.value as EventRegistrationFieldType })}
                      className="w-full h-10 px-3 border border-input rounded-md bg-background text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      {registrationFieldTypes.map((typeOption) => (
                        <option key={typeOption.value} value={typeOption.value}>
                          {typeOption.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor={`${idPrefix}-registration-field-placeholder-${field.id}`} className="text-sm font-medium text-gray-700">Placeholder</label>
                  <Input
                    id={`${idPrefix}-registration-field-placeholder-${field.id}`}
                    value={field.placeholder || ''}
                    onChange={(e) => onUpdate(index, { placeholder: e.target.value })}
                    placeholder="Hint shown in the popup input"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor={`${idPrefix}-registration-field-min-length-${field.id}`} className="text-sm font-medium text-gray-700">Min Length</label>
                    <Input
                      id={`${idPrefix}-registration-field-min-length-${field.id}`}
                      type="number"
                      min={0}
                      value={field.minLength ?? ''}
                      onChange={(e) =>
                        onUpdate(index, {
                          minLength: e.target.value ? parseInt(e.target.value, 10) : undefined,
                        })
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={`${idPrefix}-registration-field-max-length-${field.id}`} className="text-sm font-medium text-gray-700">Max Length</label>
                    <Input
                      id={`${idPrefix}-registration-field-max-length-${field.id}`}
                      type="number"
                      min={1}
                      value={field.maxLength ?? ''}
                      onChange={(e) =>
                        onUpdate(index, {
                          maxLength: e.target.value ? parseInt(e.target.value, 10) : undefined,
                        })
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <label htmlFor={`${idPrefix}-registration-field-min-value-${field.id}`} className="text-sm font-medium text-gray-700">Min Value (for number fields)</label>
                    <Input
                      id={`${idPrefix}-registration-field-min-value-${field.id}`}
                      type="number"
                      value={field.min ?? ''}
                      onChange={(e) =>
                        onUpdate(index, {
                          min: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="Optional"
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={`${idPrefix}-registration-field-max-value-${field.id}`} className="text-sm font-medium text-gray-700">Max Value (for number fields)</label>
                    <Input
                      id={`${idPrefix}-registration-field-max-value-${field.id}`}
                      type="number"
                      value={field.max ?? ''}
                      onChange={(e) =>
                        onUpdate(index, {
                          max: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                      placeholder="Optional"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label htmlFor={`${idPrefix}-registration-field-pattern-${field.id}`} className="text-sm font-medium text-gray-700">Regex Pattern (optional)</label>
                  <Input
                    id={`${idPrefix}-registration-field-pattern-${field.id}`}
                    value={field.pattern || ''}
                    onChange={(e) => onUpdate(index, { pattern: e.target.value })}
                    placeholder="e.g., ^https://"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id={`${idPrefix}-registration-field-required-${field.id}`}
                    checked={field.required}
                    onChange={(e) => onUpdate(index, { required: e.target.checked })}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                  />
                  <label htmlFor={`${idPrefix}-registration-field-required-${field.id}`} className="text-sm font-medium text-gray-700">Required field</label>
                </div>
              </div>
            ))}
          </div>
        )}

        <Button type="button" variant="outline" onClick={onAdd} className="w-full">
          <Plus className="h-4 w-4 mr-2" />
          Add Extra Registration Field
        </Button>
      </CardContent>
    </Card>
  );
}
