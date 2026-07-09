// EventRegistrantComposer — admin composer that sends a custom message to the
// people registered for an event, over the in-app bell and/or email. Mirrors the
// "Email Absentees" dialog UX (AttendanceManager) but generalised: audience can
// be narrowed and either/both channels chosen per send. Backend fan-out reuses
// broadcastNotification (CUSTOM audience) + emailService — see
// POST /api/events/:id/message-registrants.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { EVENT_AUDIENCE_OPTIONS, type MessageRegistrantsAudience } from '@/lib/api/event-ops';
import { DSCard, Field, SegmentedTabs, type SegmentedItem } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { MarkdownMessage } from '@/components/dashboard/MarkdownMessage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Bell, Loader2, Mail, Send } from 'lucide-react';

interface Props {
  eventId: string;
  eventName: string;
  eventDays?: number;
  token: string;
}

interface RegistrationStats {
  total: number;
  participants: number;
  guests: number;
  attended: number;
}

const SEND_COOLDOWN_MS = 20_000;

export default function EventRegistrantComposer({ eventId, eventName, eventDays = 1, token }: Props) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyType, setBodyType] = useState<'markdown' | 'html'>('markdown');
  const [channelEmail, setChannelEmail] = useState(true);
  const [channelInApp, setChannelInApp] = useState(true);
  const [audience, setAudience] = useState<MessageRegistrantsAudience>('all');
  const [selectedDay, setSelectedDay] = useState(1);

  const [stats, setStats] = useState<RegistrationStats | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    api
      .getEventRegistrationStats(eventId, token)
      .then((data) => {
        if (!cancelled) setStats(data);
      })
      .catch(() => {
        /* stats are a nicety; the send still works without them */
      });
    return () => {
      cancelled = true;
    };
  }, [eventId, token]);

  // Tick the clock while a cooldown is active so the button label counts down.
  useEffect(() => {
    if (cooldownUntil <= now) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cooldownUntil, now]);

  const isMultiDay = eventDays > 1;
  const daySensitive = audience === 'attended' || audience === 'absent';
  // attended/absent are the only audiences whose actual send is scoped to a
  // single day (via dayNumber); the `stats` fetch is day-agnostic (all-days
  // totals), so for those two on a multi-day event the number would be
  // misleading next to a specific-day send.
  const isDaySensitiveAudience = (v: MessageRegistrantsAudience) => v === 'attended' || v === 'absent';

  // Single source of truth for per-audience counts — audienceItems and
  // estimatedCount both derive from this so they can't desync.
  const counts = useMemo<Partial<Record<MessageRegistrantsAudience, number | undefined>>>(
    () => ({
      all: stats?.total,
      participants: stats?.participants,
      guests: stats?.guests,
      attended: stats?.attended,
      absent: stats ? Math.max(stats.participants - stats.attended, 0) : undefined,
    }),
    [stats],
  );

  const audienceItems: SegmentedItem<MessageRegistrantsAudience>[] = useMemo(
    () =>
      EVENT_AUDIENCE_OPTIONS.map((opt) => ({
        ...opt,
        count: isMultiDay && isDaySensitiveAudience(opt.value) ? undefined : counts[opt.value],
      })),
    [counts, isMultiDay],
  );

  const estimatedCount = useMemo(() => {
    if (!stats) return null;
    if (isMultiDay && daySensitive) return null;
    return counts[audience] ?? null;
  }, [stats, counts, audience, isMultiDay, daySensitive]);

  const cooldownLeft = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const canSend =
    subject.trim().length > 0 &&
    body.trim().length > 0 &&
    (channelEmail || channelInApp) &&
    !sending &&
    cooldownLeft === 0;

  const send = useCallback(async () => {
    setSending(true);
    try {
      const res = await api.messageEventRegistrants(
        eventId,
        {
          subject: subject.trim(),
          body: body.trim(),
          bodyType,
          channels: { email: channelEmail, inApp: channelInApp },
          audience,
          dayNumber: isMultiDay && daySensitive ? selectedDay : undefined,
        },
        token,
      );
      const parts: string[] = [];
      if (channelInApp) parts.push(`${res.notified} notified`);
      if (channelEmail) parts.push(`${res.emailed} emailed`);
      toast.success(parts.length ? parts.join(' · ') : 'Message sent');
      setSubject('');
      setBody('');
      setCooldownUntil(Date.now() + SEND_COOLDOWN_MS);
      setNow(Date.now());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to send message');
    } finally {
      setSending(false);
      setConfirmOpen(false);
    }
  }, [eventId, subject, body, bodyType, channelEmail, channelInApp, audience, isMultiDay, daySensitive, selectedDay, token]);

  return (
    <div className="flex flex-col gap-4">
      <DSCard className="p-5">
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--ds-text-1)]">Message registrants</h3>
            <p className="mt-0.5 text-[12.5px] text-[var(--ds-text-3)]">
              Send an in-app notification and/or email to people registered for this event.
            </p>
          </div>

          {/* Audience */}
          <Field
            label="Audience"
            hint={
              estimatedCount != null
                ? `~${estimatedCount} recipient${estimatedCount === 1 ? '' : 's'}`
                : isMultiDay && daySensitive
                  ? 'Recipient count depends on the selected day'
                  : undefined
            }
          >
            <div className="overflow-x-auto">
              <SegmentedTabs items={audienceItems} value={audience} onChange={setAudience} />
            </div>
          </Field>

          {isMultiDay && daySensitive && (
            <Field label="Day" hint="Attendance is counted for this day">
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: eventDays }, (_, i) => i + 1).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDay(d)}
                    className={
                      'h-7 min-w-8 rounded-[6px] border px-2 text-[12px] font-medium transition-colors ' +
                      (selectedDay === d
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border-subtle)] text-[var(--ds-text-2)] hover:text-[var(--ds-text-1)]')
                    }
                  >
                    Day {d}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {/* Channels */}
          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-medium text-[var(--ds-text-2)]">Channels</span>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border border-[var(--border-subtle)] px-3 py-2">
                <Switch checked={channelInApp} onCheckedChange={setChannelInApp} />
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ds-text-1)]">
                  <Bell className="h-3.5 w-3.5" /> In-app notification
                </span>
              </label>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-[8px] border border-[var(--border-subtle)] px-3 py-2">
                <Switch checked={channelEmail} onCheckedChange={setChannelEmail} />
                <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[var(--ds-text-1)]">
                  <Mail className="h-3.5 w-3.5" /> Email
                </span>
              </label>
            </div>
          </div>

          {/* Subject */}
          <Field label="Subject" required>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Message subject" maxLength={200} />
          </Field>

          {/* Body */}
          <Field
            label="Body"
            required
            hint="Use {{event}} to insert the event name"
            badge={
              <SegmentedTabs
                items={[
                  { value: 'markdown', label: 'Markdown' },
                  { value: 'html', label: 'HTML' },
                ]}
                value={bodyType}
                onChange={(v) => setBodyType(v as 'markdown' | 'html')}
              />
            }
          >
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={bodyType === 'markdown' ? 'Write your message… (Markdown supported)' : '<p>Your HTML message…</p>'}
              rows={7}
              maxLength={2000}
            />
          </Field>

          {/* Preview */}
          {body.trim() && (
            <div>
              <span className="text-[12px] font-medium text-[var(--ds-text-2)]">Preview</span>
              <div className="mt-1.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-sunken)] p-3">
                {bodyType === 'markdown' ? (
                  <MarkdownMessage>{body.replace(/\{\{event\}\}/g, () => eventName)}</MarkdownMessage>
                ) : (
                  <iframe
                    title="HTML preview"
                    sandbox=""
                    className="h-40 w-full rounded border-0 bg-white"
                    srcDoc={body.replace(/\{\{event\}\}/g, () => eventName)}
                  />
                )}
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button onClick={() => setConfirmOpen(true)} disabled={!canSend} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {cooldownLeft > 0 ? `Wait ${cooldownLeft}s` : 'Send message'}
            </Button>
          </div>
        </div>
      </DSCard>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send this message?</AlertDialogTitle>
            <AlertDialogDescription>
              {estimatedCount != null ? `About ${estimatedCount} ` : 'The selected '}
              registrant{estimatedCount === 1 ? '' : 's'} will receive it via{' '}
              {[channelInApp && 'in-app notification', channelEmail && 'email'].filter(Boolean).join(' and ')}. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={sending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void send();
              }}
              disabled={sending}
            >
              {sending ? 'Sending…' : 'Send'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
