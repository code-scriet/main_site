import { type Dispatch, type SetStateAction } from 'react';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { PollInput } from '@/lib/api';
import type { PollType } from '@/lib/pollAdmin';
import { SwitchRow } from './atoms';

interface PollEditorProps {
  form: PollInput;
  setForm: Dispatch<SetStateAction<PollInput>>;
  events?: Array<{ id: string; title: string }>;
  pollType: PollType;
  onPollTypeChange: (type: PollType) => void;
  onAddOption: () => void;
  onOptionChange: (index: number, value: string) => void;
  onRemoveOption: (index: number) => void;
  onSave: () => void;
  saving: boolean;
  lockedStructure: boolean;
  title: string;
  description: string;
}

export function PollEditor({
  form,
  setForm,
  events = [],
  pollType,
  onPollTypeChange,
  onAddOption,
  onOptionChange,
  onRemoveOption,
  onSave,
  saving,
  lockedStructure,
  title,
  description,
}: PollEditorProps) {
  return (
    <Card className="border-[var(--border-subtle)] shadow-none">
      <CardHeader>
        <CardTitle className="text-lg text-gray-950">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {lockedStructure && (
          <div className="rounded-xl border border-[var(--warning-border)] bg-[var(--warning-bg)] px-4 py-3 text-sm text-[var(--ds-text-1)]">
            This poll already has votes, so its structure is locked. You can still update the description,
            deadline, publish state, and vote-change rule, but options, anonymity, and choice mode stay fixed
            to protect existing results.
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="poll-question">Question</Label>
          <Input
            id="poll-question"
            value={form.question}
            onChange={(event) => setForm((current) => ({ ...current, question: event.target.value }))}
            placeholder="Ask a focused question"
          />
        </div>

        <div className="space-y-2">
          <Label>Poll type</Label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={pollType === 'NORMAL' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPollTypeChange('NORMAL')}
              disabled={lockedStructure}
            >
              Normal poll
            </Button>
            <Button
              type="button"
              variant={pollType === 'QUESTION' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPollTypeChange('QUESTION')}
              disabled={lockedStructure}
            >
              Question type
            </Button>
          </div>
          <p className="text-xs text-[var(--ds-text-3)]">
            Normal polls use voting options. Question type shows only a free-text answer box on the public page.
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="poll-description">Description</Label>
          <Textarea
            id="poll-description"
            value={form.description ?? ''}
            onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
            placeholder="Add context, instructions, or why this poll matters."
            rows={4}
          />
          <p className="text-xs text-[var(--ds-text-3)]">
            Normal polls show feedback below options. Question-type polls show the answer area immediately on the public page.
          </p>
        </div>

        {pollType === 'NORMAL' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <Label>Options</Label>
                {lockedStructure && (
                  <p className="text-xs text-[var(--warning)]">Options are locked after the first vote is cast.</p>
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={onAddOption} disabled={lockedStructure}>
                <Plus className="h-4 w-4" />
                Add option
              </Button>
            </div>
            <div className="space-y-3">
              {form.options.map((option, index) => (
                <div key={`${index}-${form.options.length}`} className="flex gap-2">
                  <Input
                    value={option}
                    onChange={(event) => onOptionChange(index, event.target.value)}
                    placeholder={`Option ${index + 1}`}
                    disabled={lockedStructure}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => onRemoveOption(index)}
                    disabled={lockedStructure || form.options.length <= 2}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--ds-text-2)]">
            Question-type polls skip option voting and show only the answer textbox on the public page.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="poll-deadline">Deadline</Label>
            <Input
              id="poll-deadline"
              type="datetime-local"
              value={form.deadline ?? ''}
              onChange={(event) => setForm((current) => ({ ...current, deadline: event.target.value }))}
            />
          </div>
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-sm text-[var(--ds-text-2)]">
            Share URL becomes available after save and always points to the public poll page.
          </div>
        </div>

        {/* S-10: link this poll to an event so it becomes the post-event feedback poll. */}
        <div className="space-y-2">
          <Label htmlFor="poll-event">Post-event feedback for (optional)</Label>
          <select
            id="poll-event"
            value={form.eventId ?? ''}
            onChange={(event) => setForm((current) => ({ ...current, eventId: event.target.value || null }))}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">— Not a feedback poll —</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>{ev.title}</option>
            ))}
          </select>
          <p className="text-xs text-[var(--ds-text-3)]">
            When linked and published, attendees of this event are automatically asked for feedback (with a link to this poll) about a day after it ends.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <SwitchRow
            label="Multiple choice"
            description="Allow users to pick more than one option in a single ballot."
            checked={Boolean(form.allowMultipleChoices)}
            onChange={(checked) => setForm((current) => ({ ...current, allowMultipleChoices: checked }))}
            disabled={lockedStructure || pollType === 'QUESTION'}
          />
          <SwitchRow
            label="Allow vote changes"
            description="Let users revisit the poll and update their selection before it closes."
            checked={Boolean(form.allowVoteChange)}
            onChange={(checked) => setForm((current) => ({ ...current, allowVoteChange: checked }))}
            disabled={pollType === 'QUESTION'}
          />
          <SwitchRow
            label="Anonymous voting"
            description="Hide per-user vote details from admin response views and exports."
            checked={Boolean(form.isAnonymous)}
            onChange={(checked) => setForm((current) => ({ ...current, isAnonymous: checked }))}
            disabled={lockedStructure}
          />
          <SwitchRow
            label="Published"
            description="Control whether the poll appears publicly and on the dashboard."
            checked={Boolean(form.isPublished)}
            onChange={(checked) => setForm((current) => ({ ...current, isPublished: checked }))}
          />
        </div>

        <div className="flex justify-end">
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save poll
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
