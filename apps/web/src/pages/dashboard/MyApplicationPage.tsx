// Dashboard — "My Application" tab (candidate-side hiring surface).
// Only shown in the nav to candidates who have filled the hiring form. It shows
// their full application, lets them edit it while PENDING, and — once the admin
// moves them to INTERVIEW_SCHEDULED — surfaces the open interview slots inline
// (via the shared InterviewSlotsContent) plus cohort announcements/updates.

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import {
  Briefcase, Pencil, X, Check, Loader2, ExternalLink, FileText,
  Mail, Phone, GraduationCap, ArrowRight, CalendarClock, PartyPopper, MessageSquare, CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { api, ApiError } from '@/lib/api';
import type { HiringApplicationDetail } from '@/lib/api';
import { teamLabel, teamQuestionsFor } from '@/lib/hiringTeams';
import { extractApiErrorMessage } from '@/lib/error';
import { Avatar, Banner, DSCard, EmptyState, Pill, Section, type PillTone } from '@/components/dash';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { InterviewSlotsContent } from '@/pages/hiring/InterviewSlotsPage';
import { MessageBody } from '@/components/hiring/MessageBody';

const STATUS_TONE: Record<string, PillTone> = {
  PENDING: 'warning',
  INTERVIEW_SCHEDULED: 'info',
  SLOT_BOOKED: 'accent',
  INTERVIEWED: 'neutral',
  SELECTED: 'success',
  REJECTED: 'danger',
};

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Under review',
  INTERVIEW_SCHEDULED: 'Interview scheduled',
  SLOT_BOOKED: 'Slot booked',
  INTERVIEWED: 'Interviewed',
  SELECTED: 'Selected',
  REJECTED: 'Not selected',
};

function statusTone(status: string): PillTone {
  return STATUS_TONE[status] ?? 'neutral';
}
function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
}

// ─── Pipeline strip (presentational) ─────────────────────────────────────────
// The candidate-facing hiring journey as a compact 5-step strip, so the tab
// reads as a process with a position in it rather than a single status word.
// Derived purely from `application.status` — no extra fetches, no behavior.
const PIPELINE_STAGES = [
  { label: 'Applied', short: 'Applied' },
  { label: 'Under review', short: 'Review' },
  { label: 'Interview scheduled', short: 'Interview' },
  { label: 'Slot booked', short: 'Slot' },
  { label: 'Decision', short: 'Decision' },
];

const PIPELINE_STAGE_FOR_STATUS: Record<string, number> = {
  PENDING: 1,
  INTERVIEW_SCHEDULED: 2,
  SLOT_BOOKED: 3,
  INTERVIEWED: 4,
  SELECTED: 4,
  REJECTED: 4,
};

function Pipeline({ status }: { status: string }) {
  const current = PIPELINE_STAGE_FOR_STATUS[status] ?? 1;
  const lastIndex = PIPELINE_STAGES.length - 1;
  const atDecision = current === lastIndex;
  const captionClass = atDecision
    ? status === 'SELECTED'
      ? 'text-[var(--success)]'
      : status === 'REJECTED'
        ? 'text-[var(--danger)]'
        : 'text-[var(--ds-text-2)]'
    : 'text-[var(--accent)]';

  return (
    <DSCard padded={false} className="px-4 py-3.5 sm:px-6 sm:py-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <span className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">
          Progress
        </span>
        <span className={`text-[11.5px] font-medium ${captionClass}`}>
          {atDecision ? 'Final stage' : `Stage ${current + 1} of ${PIPELINE_STAGES.length}`}
        </span>
      </div>
      <ol className="flex items-start">
        {PIPELINE_STAGES.map((stage, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={stage.label} className="flex-1 min-w-0 flex flex-col items-center">
              <div className="flex items-center w-full">
                <span
                  className={`h-px flex-1 ${
                    i === 0 ? 'invisible' : done || active ? 'bg-[var(--success)]' : 'bg-[var(--border-default)]'
                  }`}
                />
                <span
                  className={`size-[18px] shrink-0 grid place-items-center rounded-full border ${
                    active
                      ? status === 'REJECTED'
                        ? 'bg-[var(--danger)] border-transparent shadow-[0_0_0_4px_var(--danger-bg)]'
                        : status === 'SELECTED'
                          ? 'bg-[var(--success)] border-transparent shadow-[0_0_0_4px_var(--success-bg)]'
                          : 'bg-[var(--accent)] border-transparent shadow-[0_0_0_4px_var(--accent-subtle)]'
                      : done
                        ? 'bg-[var(--success)] border-transparent'
                        : 'bg-[var(--bg-raised)] border-[var(--border-strong)]'
                  }`}
                >
                  {done && <Check size={11} className="text-white" />}
                </span>
                <span
                  className={`h-px flex-1 ${
                    i === lastIndex ? 'invisible' : done ? 'bg-[var(--success)]' : 'bg-[var(--border-default)]'
                  }`}
                />
              </div>
              <span
                className={`mt-2 px-0.5 text-center leading-tight text-[10px] sm:text-[11.5px] ${
                  active
                    ? 'font-semibold text-[var(--ds-text-1)]'
                    : done
                      ? 'font-medium text-[var(--ds-text-2)]'
                      : 'font-medium text-[var(--ds-text-3)]'
                }`}
              >
                <span className="sm:hidden">{stage.short}</span>
                <span className="hidden sm:inline">{stage.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </DSCard>
  );
}

interface EditDraft {
  phone: string;
  department: string;
  year: string;
  skills: string;
  cvLink: string;
  whyJoin: string;
  teamQuestion1: string;
  teamQuestion2: string;
}

function draftFrom(app: HiringApplicationDetail): EditDraft {
  return {
    phone: app.phone ?? '',
    department: app.department ?? '',
    year: app.year ?? '',
    skills: app.skills ?? '',
    cvLink: app.cvLink ?? '',
    whyJoin: app.whyJoin ?? '',
    teamQuestion1: app.teamQuestion1 ?? '',
    teamQuestion2: app.teamQuestion2 ?? '',
  };
}

export default function MyApplicationPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const appQ = useQuery({
    queryKey: ['my-hiring'],
    queryFn: () => api.getMyHiringApplication(token!),
    enabled: Boolean(token),
  });

  const application = appQ.data?.application;
  const editable = Boolean(appQ.data?.editable) && Boolean(application);

  // Direct messages the hiring team sent to this candidate (email + bell copies
  // also go out; this is the persistent in-tab inbox).
  const msgQ = useQuery({
    queryKey: ['my-hiring-messages'],
    queryFn: () => api.getMyHiringMessages(token!),
    enabled: Boolean(token) && Boolean(application),
  });
  const messages = msgQ.data?.messages ?? [];

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditDraft | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const setField = (key: keyof EditDraft) => (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    setDraft((prev) => (prev ? { ...prev, [key]: e.target.value } : prev));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const saveMut = useMutation({
    mutationFn: () => {
      if (!draft || !application) throw new Error('Nothing to save');
      return api.updateMyHiringApplication(
        {
          phone: draft.phone.trim() || null,
          department: draft.department.trim(),
          year: draft.year.trim(),
          skills: draft.skills.trim() || null,
          cvLink: draft.cvLink.trim() || null,
          whyJoin: draft.whyJoin.trim() || null,
          teamQuestion1: draft.teamQuestion1.trim() || null,
          teamQuestion2: draft.teamQuestion2.trim() || null,
        },
        token!,
      );
    },
    onSuccess: (res) => {
      qc.setQueryData(['my-hiring'], {
        hasApplied: true,
        hasApplication: true,
        editable: res.application.status === 'PENDING',
        application: res.application,
      });
      setEditing(false);
      toast.success('Application updated');
    },
    onError: (e: unknown) => {
      if (e instanceof ApiError && Object.keys(e.fieldErrors).length > 0) {
        setFieldErrors(e.fieldErrors);
        toast.error('Please fix the highlighted fields.');
      } else {
        toast.error(extractApiErrorMessage(e, 'Could not save your changes'));
      }
    },
  });

  const startEdit = () => {
    if (!application) return;
    setDraft(draftFrom(application));
    setFieldErrors({});
    setEditing(true);
  };

  const cancelEdit = () => {
    if (application) setDraft(draftFrom(application));
    setEditing(false);
    setFieldErrors({});
  };

  const questions = useMemo(
    () => (application ? teamQuestionsFor(application.applyingRole) : []),
    [application],
  );

  if (appQ.isLoading) {
    return (
      <div className="mx-auto w-full max-w-[860px] flex flex-col gap-6">
        <div className="h-8 w-52 bg-[var(--surface-soft)] rounded-[10px] animate-pulse" />
        <div className="h-[86px] bg-[var(--surface-soft)] rounded-[var(--radius-lg)] animate-pulse" />
        {[0, 1].map((i) => (
          <div key={i} className="h-40 bg-[var(--surface-soft)] rounded-[12px] animate-pulse" />
        ))}
      </div>
    );
  }

  if (!application) {
    return (
      <div className="mx-auto w-full max-w-[860px] flex flex-col gap-6">
        <Section eyebrow="Hiring" title="My application">
          <DSCard padded className="p-5 sm:p-6">
            <EmptyState
              icon={<Briefcase size={18} />}
              title="You have not applied yet"
              body="Pick a team and submit your application to track its status, edit your answers, and book an interview slot when the hiring team schedules you."
              action={
                <Button
                  asChild
                  className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white"
                >
                  <Link to="/join-us">Join our team <ArrowRight size={13} className="ml-1" /></Link>
                </Button>
              }
            />
          </DSCard>
        </Section>
      </div>
    );
  }

  const canPickSlots = application.status === 'INTERVIEW_SCHEDULED' || application.status === 'SLOT_BOOKED';

  return (
    <div className="mx-auto w-full max-w-[1400px] flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-[10.5px] uppercase tracking-[0.08em] font-semibold text-[var(--ds-text-3)]">Hiring</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">My Club Application</h1>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Pill tone="accent" size="sm">{teamLabel(application.applyingRole)}</Pill>
            <Pill tone={statusTone(application.status)} size="sm">{statusLabel(application.status)}</Pill>
            <span className="text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
              applied {new Date(application.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Where the candidate sits in the hiring pipeline */}
      <Pipeline status={application.status} />

      {/* Status guidance */}
      {application.status === 'PENDING' && (
        <Banner tone="warning" icon={<CalendarClock size={15} />} title="Your application is under review">
          The hiring team is reviewing applications. Once yours moves to “Interview scheduled”, slot picking opens here and you will get an email and a bell alert.
        </Banner>
      )}
      {application.status === 'SELECTED' && (
        <Banner tone="success" icon={<PartyPopper size={15} />} title="You are selected — welcome aboard!">
          Congratulations! Watch your announcements and inbox for onboarding next steps.
        </Banner>
      )}
      {application.status === 'REJECTED' && (
        <Banner tone="info" icon={<Briefcase size={15} />} title="This cycle did not work out">
          Thank you for applying. We will keep your details on file and encourage you to re-apply in the next hiring cycle.
        </Banner>
      )}
      {application.status === 'INTERVIEWED' && (
        <Banner tone="info" icon={<CheckCircle2 size={15} />} title="Interview complete — awaiting the decision">
          Thanks for interviewing! The team is finalizing decisions. We'll notify you here and by email.
        </Banner>
      )}

      {/* Messages from the team — extremely visible, full-width, near the top */}
      {messages.length > 0 && (
        <div className="rounded-[14px] border-2 border-[var(--accent)] bg-[var(--bg-raised)] overflow-hidden shadow-[var(--shadow-sm)]">
          <div className="flex items-center gap-2.5 px-4 sm:px-5 py-3 bg-[var(--accent-subtle)] border-b border-[var(--accent)]/20">
            <span className="size-8 rounded-[9px] bg-[var(--accent)] text-white grid place-items-center shrink-0">
              <MessageSquare size={16} />
            </span>
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-[var(--ds-text-1)]">Messages from the team</div>
              <div className="text-[12.5px] text-[var(--ds-text-3)]">Newest first — also sent by email and in your bell.</div>
            </div>
            <span className="ml-auto shrink-0 rounded-full bg-[var(--accent)] text-white text-[12px] font-semibold px-2.5 h-6 grid place-items-center tabular-nums">
              {messages.length}
            </span>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {messages.map((m) => (
              <div key={m.id} className="px-4 sm:px-5 py-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[15px] font-semibold text-[var(--ds-text-1)]">{m.subject}</span>
                  <span className="ml-auto text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
                    {new Date(m.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>
                <MessageBody className="mt-2" children={m.body} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interview + Application — two columns on wide screens to use the space */}
      <div className={'grid gap-6' + (canPickSlots ? ' xl:grid-cols-2' : '')}>
        {/* Interview section (slots + updates) — only once scheduled */}
        {canPickSlots && (
          <Section eyebrow="Interview" title="Pick & manage your slot">
            <InterviewSlotsContent embedded />
          </Section>
        )}

        {/* Application details / editor */}
        <Section
          eyebrow="Application"
          title={editing ? 'Edit your application' : 'Your application'}
          description={editing ? 'Save changes before your application moves into the interview pipeline.' : undefined}
          action={
            !editing && editable ? (
              <Button size="sm" variant="outline" onClick={startEdit}>
                <Pencil size={13} className="mr-1.5" /> Edit
              </Button>
            ) : null
          }
        >
          <DSCard padded className="p-5 sm:p-6">
            {!editing ? (
              <ReadOnlyView application={application} questions={questions} />
            ) : draft ? (
              <div className="flex flex-col gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Email" value={application.email} icon={<Mail size={13} />} locked />
                  <Field label="Phone" value={draft.phone} icon={<Phone size={13} />} onChange={setField('phone')} error={fieldErrors.phone} placeholder="9876543210" />
                  <Field label="Department / Branch" required value={draft.department} icon={<GraduationCap size={13} />} onChange={setField('department')} error={fieldErrors.department} />
                  <Field label="Academic Year" required value={draft.year} icon={<GraduationCap size={13} />} onChange={setField('year')} error={fieldErrors.year} />
                </div>

                <LabeledInput label="Skills">
                  <Input value={draft.skills} onChange={setField('skills')} placeholder="Python, React, Figma…" className="h-11" />
                </LabeledInput>

                <LabeledInput label="CV / Resume link" hint="Google Drive link — set sharing to “Anyone with the link”.">
                  <Input value={draft.cvLink} onChange={setField('cvLink')} type="url" placeholder="https://drive.google.com/file/d/…/view" className="h-11" />
                  {fieldErrors.cvLink && <p className="mt-1 text-xs text-[var(--danger)]">{fieldErrors.cvLink}</p>}
                </LabeledInput>

                <LabeledInput label="Why do you want to join code.scriet?">
                  <Textarea value={draft.whyJoin} onChange={setField('whyJoin')} rows={3} maxLength={4000} placeholder="What draws you to the club and what you hope to build." />
                </LabeledInput>

                {questions.map((q) => (
                  <LabeledInput key={q.key} label={q.label}>
                    <Textarea
                      value={draft[q.key]}
                      onChange={setField(q.key)}
                      rows={2}
                      maxLength={4000}
                      placeholder={q.placeholder}
                    />
                  </LabeledInput>
                ))}

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                    {saveMut.isPending ? <Loader2 size={13} className="mr-1.5 animate-spin" /> : <Check size={13} className="mr-1.5" />}
                    Save changes
                  </Button>
                  <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={saveMut.isPending}>
                    <X size={13} className="mr-1.5" /> Cancel
                  </Button>
                </div>
              </div>
            ) : null}
          </DSCard>
        </Section>
      </div>

      {!editable && !editing && (
        <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-4 py-3 text-[12px] leading-snug text-[var(--ds-text-3)]">
          Your answers are locked once your interview is scheduled. Need a change? Reach out to the hiring team.{' '}
          <button className="underline hover:text-[var(--accent)]" onClick={() => navigate('/contact')}>Contact us</button>
        </div>
      )}
    </div>
  );
}

// ─── Read-only detail view ───────────────────────────────────────────────────
function ReadOnlyView({
  application, questions, onEdit,
}: {
  application: HiringApplicationDetail;
  questions: ReturnType<typeof teamQuestionsFor>;
  onEdit?: () => void;
}) {
  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  // Only non-empty answers are listed, but short facts take one column and
  // written answers span both — so a sparse application still reads as a
  // structured record instead of a couple of lonely lines.
  const items: Array<{ label: string; value?: string | null; wide?: boolean }> = [
    { label: 'Department / Branch', value: application.department },
    { label: 'Academic Year', value: application.year },
    { label: 'Phone', value: application.phone },
    { label: 'Skills', value: application.skills },
    { label: 'Why join', value: application.whyJoin, wide: true },
    ...questions.map((q) => ({
      label: q.label,
      value: q.key === 'teamQuestion1' ? application.teamQuestion1 : application.teamQuestion2,
      wide: true,
    })),
  ].filter((it) => it.value && it.value.trim());

  return (
    <div className="flex flex-col gap-5">
      {/* Who applied */}
      <div className="flex items-center gap-3 flex-wrap rounded-[12px] border border-[var(--border-subtle)] bg-[var(--surface-soft)] px-3.5 py-3">
        <Avatar name={application.name} size={34} />
        <div className="min-w-0 flex-1 basis-[160px]">
          <div className="text-[15px] font-semibold text-[var(--ds-text-1)] truncate">{application.name}</div>
          <div className="flex items-center gap-1.5 min-w-0 text-[13px] text-[var(--ds-text-3)]">
            <Mail size={13} className="shrink-0" />
            <span className="truncate">{application.email}</span>
          </div>
        </div>
        {application.cvLink && (
          <a
            href={application.cvLink}
            target="_blank"
            rel="noreferrer noopener"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-[9px] border border-[var(--border-default)] bg-[var(--bg-raised)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--accent)] hover:bg-[var(--accent-subtle)]"
          >
            <FileText size={13} /> Open CV <ExternalLink size={11} />
          </a>
        )}
      </div>

      {/* What they wrote */}
      {items.length > 0 ? (
        <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {items.map((it) => (
            <div
              key={it.label}
              className={`flex flex-col gap-1 min-w-0${it.wide ? ' sm:col-span-2' : ''}`}
            >
              <dt className="text-[11.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">{it.label}</dt>
              <dd className="text-[14.5px] leading-relaxed text-[var(--ds-text-1)] whitespace-pre-wrap break-words">{it.value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-[13px] text-[var(--ds-text-3)]">
          No written answers were added to this application — the hiring team is working from your profile details.
        </p>
      )}

      {/* Record meta — keeps the card grounded when the answers above are short */}
      <div className="flex items-center gap-x-5 gap-y-1.5 flex-wrap pt-4 border-t border-[var(--border-subtle)] text-[11.5px] text-[var(--ds-text-3)] font-mono tabular-nums">
        <span>Applied {fmt(application.createdAt)}</span>
        {application.updatedAt && <span>Updated {fmt(application.updatedAt)}</span>}
        {application.cycle && <span>Cycle {application.cycle}</span>}
      </div>

      {onEdit && (
        <div className="pt-1 border-t border-[var(--border-subtle)]">
          <Button size="sm" variant="outline" onClick={onEdit}>
            <Pencil size={13} className="mr-1.5" /> Edit application
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Small form primitives (dashboard token styling) ─────────────────────────
function Field({
  label, value, icon, onChange, error, placeholder, required, locked, type = 'text',
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
  onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  locked?: boolean;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-[var(--ds-text-2)]">
        {label} {required && <span className="text-[var(--danger)]">*</span>}
      </span>
      <div className="relative">
        {icon && <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none">{icon}</span>}
        <Input
          type={type}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={locked}
          className={`h-11 ${icon ? 'pl-9' : ''} ${locked ? 'bg-[var(--surface-soft)] text-[var(--ds-text-3)] cursor-not-allowed' : ''}`}
        />
      </div>
      {error && <span className="text-xs text-[var(--danger)]">{error}</span>}
    </label>
  );
}

function LabeledInput({
  label, hint, children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12.5px] font-medium text-[var(--ds-text-2)]">{label}</span>
      {children}
      {hint && <span className="text-[11.5px] text-[var(--ds-text-3)]">{hint}</span>}
    </label>
  );
}
