// Dashboard v2 — Admin · Send Mail composer.
// Audience selector (All / Network / Event / Specific) + subject + markdown body + live preview + send.
// Pixel-port of screen-stubs.jsx:302 + brief §7.19.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Mail, Send, Search, X, Loader2, AlertCircle, CheckCircle, Eye, Code, AtSign, Plus, Inbox } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { Avatar, DSCard, Field, Pill, SegmentedTabs } from '@/components/dash';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Markdown } from '@/components/ui/markdown';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { isValidEmail } from '@/lib/email';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
type BodyType = 'markdown' | 'html';
type Audience = 'all_users' | 'all_network' | 'specific';

interface Recipient { id: string; name: string; email: string; role?: string }

const MAX_CC_BCC = 50;

export default function AdminMail() {
  const { token } = useAuth();
  const [audience, setAudience] = useState<Audience>('all_users');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [bodyType, setBodyType] = useState<BodyType>('markdown');
  const [showPreview, setShowPreview] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [searchQ, setSearchQ] = useState('');
  const [searchType, setSearchType] = useState<'users' | 'network'>('users');
  const [results, setResults] = useState<Recipient[]>([]);
  const [selected, setSelected] = useState<Recipient[]>([]);
  const [searching, setSearching] = useState(false);
  const [manualEmail, setManualEmail] = useState('');
  const [ccInput, setCcInput] = useState('');
  const [bccInput, setBccInput] = useState('');
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [cooldown, setCooldown] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const doSearch = useCallback(async (q: string) => {
    if (!token || !q.trim()) { setResults([]); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setSearching(true);
    try {
      const res = await fetch(`${API_URL}/mail/recipients?search=${encodeURIComponent(q)}&type=${searchType}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error('search failed');
      const data = await res.json();
      if (!ctrl.signal.aborted) {
        const recipients = Array.isArray(data.data) ? data.data : (data.data?.recipients ?? []);
        setResults(recipients);
      }
    } catch (e) {
      if ((e as Error).name !== 'AbortError') setResults([]);
    } finally {
      if (!ctrl.signal.aborted) setSearching(false);
    }
  }, [token, searchType]);

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const t = setTimeout(() => { void doSearch(searchQ); }, 200);
    return () => clearTimeout(t);
  }, [searchQ, doSearch]);

  const addManualEmail = () => {
    const e = manualEmail.trim().toLowerCase();
    if (!isValidEmail(e)) { toast.error('Invalid email'); return; }
    if (selected.some((r) => r.email.toLowerCase() === e)) return;
    setSelected((p) => [...p, { id: `manual-${e}`, name: e, email: e }]);
    setManualEmail('');
  };
  const addCc = () => {
    const e = ccInput.trim().toLowerCase();
    if (!isValidEmail(e)) { toast.error('Invalid CC'); return; }
    if (cc.includes(e)) { setCcInput(''); return; }
    if (cc.length >= MAX_CC_BCC) { toast.error(`Max ${MAX_CC_BCC} CC recipients`); return; }
    setCc((p) => [...p, e]);
    setCcInput('');
  };
  const addBcc = () => {
    const e = bccInput.trim().toLowerCase();
    if (!isValidEmail(e)) { toast.error('Invalid BCC'); return; }
    if (bcc.includes(e)) { setBccInput(''); return; }
    if (bcc.length >= MAX_CC_BCC) { toast.error(`Max ${MAX_CC_BCC} BCC recipients`); return; }
    setBcc((p) => [...p, e]);
    setBccInput('');
  };

  // Pulls any pending manual email out of the input box so admins who
  // forget to click "+ Add" don't get a silent "no recipients" failure.
  // Returns the merged selected list (does not mutate state synchronously).
  const flushPendingManualEmail = (): Recipient[] => {
    const pending = manualEmail.trim().toLowerCase();
    if (!pending) return selected;
    if (!isValidEmail(pending)) return selected;
    if (selected.some((r) => r.email.toLowerCase() === pending)) return selected;
    const added: Recipient = { id: `manual-${pending}`, name: pending, email: pending };
    const merged = [...selected, added];
    setSelected(merged);
    setManualEmail('');
    return merged;
  };

  const pendingValid = audience === 'specific' && manualEmail.trim() !== '' && isValidEmail(manualEmail.trim().toLowerCase());
  const hasRecipients = audience !== 'specific' || selected.length > 0 || pendingValid;
  const recipientCount = audience === 'specific' ? selected.length + (pendingValid && !selected.some((s) => s.email.toLowerCase() === manualEmail.trim().toLowerCase()) ? 1 : 0) : '~all';

  const send = async () => {
    if (!token) return;
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required'); return; }
    const effectiveSelected = audience === 'specific' ? flushPendingManualEmail() : selected;
    if (audience === 'specific' && effectiveSelected.length === 0) { setError('Add at least one recipient'); return; }
    setSending(true); setError(null); setSuccess(null);
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const payload = {
        audience,
        emails: audience === 'specific' ? effectiveSelected.map((r) => r.email) : undefined,
        cc: cc.length > 0 ? cc : undefined,
        bcc: bcc.length > 0 ? bcc : undefined,
        subject: subject.trim(),
        body: body.trim(),
        bodyType,
      };
      const res = await fetch(`${API_URL}/mail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Send failed (HTTP ${res.status})`);
      setSuccess(data.message || `Sent to ${data.data?.recipientCount ?? 0} recipient(s)`);
      setConfirm(false);
      setSubject(''); setBody(''); setSelected([]); setCc([]); setBcc([]); setManualEmail('');
      setCooldown(30);
      toast.success('Mail sent');
    } catch (e) {
      const msg = (e as Error)?.name === 'AbortError'
        ? 'Send timed out after 60s. Check Brevo status / server logs.'
        : (e instanceof Error ? e.message : 'Send failed');
      setError(msg);
      toast.error(msg);
    } finally {
      clearTimeout(timeoutId);
      setSending(false);
    }
  };

  const sendTest = async () => {
    if (!token) return;
    if (!subject.trim() || !body.trim()) { setError('Subject and body are required'); return; }
    setSending(true); setError(null);
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 60_000);
    try {
      const res = await fetch(`${API_URL}/mail/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ audience: 'specific', testToSelf: true, subject: subject.trim(), body: body.trim(), bodyType }),
        signal: ctrl.signal,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error?.message || `Test send failed (HTTP ${res.status})`);
      toast.success('Test sent to you');
    } catch (e) {
      const msg = (e as Error)?.name === 'AbortError'
        ? 'Test send timed out after 60s.'
        : (e instanceof Error ? e.message : 'Test send failed');
      setError(msg);
      toast.error(msg);
    } finally {
      clearTimeout(timeoutId);
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 pb-24">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10.5px] uppercase tracking-[0.06em] font-semibold text-[var(--ds-text-3)]">Admin</div>
          <h1 className="text-[24px] font-semibold tracking-tight mt-1">Send mail</h1>
          <p className="text-[13px] text-[var(--ds-text-3)] mt-1">Be careful — this fires real emails the moment you confirm.</p>
        </div>
        <Pill tone="warning" size="sm"><Mail size={11} className="mr-1" />Live mailer</Pill>
      </div>

      {error && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--danger-border)] bg-[var(--danger-bg)] text-[var(--danger)] text-[13px]">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X size={14} /></button>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 px-4 py-2.5 rounded-[10px] border border-[var(--success-border)] bg-[var(--success-bg)] text-[var(--success)] text-[13px]">
          <CheckCircle size={14} className="mt-0.5 shrink-0" />
          <span className="flex-1">{success}</span>
        </div>
      )}

      <div className="grid lg:grid-cols-12 gap-4">
        <DSCard padded className="lg:col-span-7 flex flex-col gap-4">
          <div>
            <div className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5">Audience</div>
            <SegmentedTabs
              items={[
                { value: 'all_users', label: 'All registered' },
                { value: 'all_network', label: 'All NETWORK' },
                { value: 'specific', label: 'Specific recipients' },
              ]}
              value={audience}
              onChange={(v) => setAudience(v as Audience)}
            />
          </div>

          {audience === 'specific' && (
            <div className="flex flex-col gap-3 pt-1">
              <div className="flex items-center gap-2">
                <SegmentedTabs
                  items={[
                    { value: 'users', label: 'Users' },
                    { value: 'network', label: 'Network' },
                  ]}
                  value={searchType}
                  onChange={(v) => setSearchType(v as 'users' | 'network')}
                />
              </div>
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ds-text-3)] pointer-events-none" />
                <Input
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  placeholder={`Search ${searchType}…`}
                  className="pl-8 h-9 text-[13px]"
                />
              </div>
              {searchQ.trim() && (
                <div className="border border-[var(--border-subtle)] rounded-[8px] max-h-[180px] overflow-y-auto bg-[var(--surface-soft)]/40">
                  {searching ? (
                    <div className="p-3 text-[12px] text-[var(--ds-text-3)] text-center"><Loader2 size={13} className="inline animate-spin" /> searching…</div>
                  ) : results.length === 0 ? (
                    <div className="p-3 text-[12px] text-[var(--ds-text-3)] text-center">No matches</div>
                  ) : (
                    results.map((r) => {
                      const picked = selected.some((s) => s.email === r.email);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelected((p) => picked ? p.filter((x) => x.email !== r.email) : [...p, r])}
                          className={cn(
                            'w-full px-3 py-2 flex items-center gap-2.5 border-b border-[var(--border-subtle)] last:border-b-0 text-left transition-colors',
                            picked ? 'bg-[var(--accent-subtle)]/30' : 'hover:bg-[var(--surface-soft)]',
                          )}
                        >
                          <Avatar name={r.name} size={24} />
                          <div className="flex-1 min-w-0">
                            <div className="text-[12.5px] font-medium truncate">{r.name}</div>
                            <div className="text-[11px] text-[var(--ds-text-3)] truncate">{r.email}</div>
                          </div>
                          {r.role && <Pill tone="neutral" size="xs">{r.role.replace(/_/g, ' ')}</Pill>}
                          {picked && <CheckCircle size={13} className="text-[var(--accent)]" />}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--border-subtle)]">
                <AtSign size={13} className="text-[var(--ds-text-3)]" />
                <Input value={manualEmail} onChange={(e) => setManualEmail(e.target.value)} placeholder="External email address" className="h-8 text-[13px] flex-1" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addManualEmail(); } }} />
                <Button type="button" size="sm" variant="outline" onClick={addManualEmail}><Plus size={11} /></Button>
              </div>
              {selected.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[var(--border-subtle)]">
                  {selected.map((r) => (
                    <span key={r.email} className="inline-flex items-center gap-1 h-6 px-2 rounded-[5px] bg-[var(--surface-soft)] text-[12px] text-[var(--ds-text-2)]">
                      {r.name === r.email ? r.email : r.name}
                      <button type="button" onClick={() => setSelected((p) => p.filter((x) => x.email !== r.email))}><X size={9} /></button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="border-t border-[var(--border-subtle)] pt-3">
            <Field label="Subject" required>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Round 3 — final reminder" />
            </Field>
          </div>

          <Field label="Body" required hint={bodyType === 'markdown' ? 'Markdown' : 'HTML'}>
            <div className="rounded-[8px] border border-[var(--border-default)] overflow-hidden">
              <div className="h-9 px-2 flex items-center gap-1 border-b border-[var(--border-subtle)] bg-[var(--surface-soft)]">
                <SegmentedTabs
                  items={[
                    { value: 'markdown', label: 'Markdown' },
                    { value: 'html', label: 'HTML' },
                  ]}
                  value={bodyType}
                  onChange={(v) => setBodyType(v as BodyType)}
                />
                <div className="flex-1" />
                <button type="button" onClick={() => setShowPreview((s) => !s)} className="text-[11.5px] inline-flex items-center gap-1 text-[var(--ds-text-3)] hover:text-[var(--ds-text-1)]">
                  {showPreview ? <Code size={11} /> : <Eye size={11} />}
                  {showPreview ? 'Edit' : 'Preview'}
                </button>
              </div>
              {showPreview ? (
                bodyType === 'markdown' ? (
                  <div className="p-4 min-h-[240px] max-h-[480px] overflow-y-auto bg-[var(--bg-raised)] text-[13px]">
                    <Markdown>{body || 'Body preview…'}</Markdown>
                  </div>
                ) : (
                  // HTML preview is sandboxed in an iframe so admin-pasted <script>/<style>
                  // can't leak into the live dashboard. Server-side sanitizeHtml still runs on send.
                  <iframe
                    title="Email HTML preview"
                    sandbox=""
                    srcDoc={body || '<p style="color:#999;font-family:sans-serif;padding:16px;">Nothing to preview yet.</p>'}
                    className="w-full min-h-[240px] max-h-[480px] bg-white"
                  />
                )
              ) : (
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  className="w-full h-[240px] p-3 text-[13px] font-mono bg-[var(--bg-raised)] outline-none resize-y"
                  placeholder={bodyType === 'markdown' ? '## Heading\n\nHi {{name}},\n\nReminder text…' : '<p>HTML body</p>'}
                />
              )}
            </div>
          </Field>

          {/* CC/BCC */}
          <div className="grid sm:grid-cols-2 gap-3 border-t border-[var(--border-subtle)] pt-3">
            <div>
              <div className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5">CC</div>
              <div className="flex items-center gap-2">
                <Input value={ccInput} onChange={(e) => setCcInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCc(); } }} placeholder="email@…" className="h-8 text-[12.5px]" />
                <Button size="sm" variant="outline" onClick={addCc}><Plus size={11} /></Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {cc.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[5px] bg-[var(--surface-soft)] text-[11px] text-[var(--ds-text-2)]">
                    {e}
                    <button type="button" onClick={() => setCc((p) => p.filter((x) => x !== e))}><X size={9} /></button>
                  </span>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[12px] font-medium text-[var(--ds-text-2)] mb-1.5">BCC</div>
              <div className="flex items-center gap-2">
                <Input value={bccInput} onChange={(e) => setBccInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addBcc(); } }} placeholder="email@…" className="h-8 text-[12.5px]" />
                <Button size="sm" variant="outline" onClick={addBcc}><Plus size={11} /></Button>
              </div>
              <div className="flex flex-wrap gap-1 mt-1.5">
                {bcc.map((e) => (
                  <span key={e} className="inline-flex items-center gap-1 h-5 px-1.5 rounded-[5px] bg-[var(--surface-soft)] text-[11px] text-[var(--ds-text-2)]">
                    {e}
                    <button type="button" onClick={() => setBcc((p) => p.filter((x) => x !== e))}><X size={9} /></button>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </DSCard>

        <DSCard padded={false} className="lg:col-span-5 sticky top-[72px] self-start">
          <div className="px-4 h-9 border-b border-[var(--border-subtle)] flex items-center justify-between bg-[var(--bg-sunken)]">
            <span className="text-[11.5px] font-medium text-[var(--ds-text-3)]">Send summary</span>
            <Inbox size={12} className="text-[var(--ds-text-3)]" />
          </div>
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ds-text-3)]">Audience</span>
              <span className="font-medium">{audience === 'all_users' ? 'All registered users' : audience === 'all_network' ? 'All NETWORK members' : `${selected.length} recipient${selected.length === 1 ? '' : 's'}`}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ds-text-3)]">CC / BCC</span>
              <span className="font-mono tabular-nums">{cc.length} / {bcc.length}</span>
            </div>
            <div className="flex items-center justify-between text-[12.5px]">
              <span className="text-[var(--ds-text-3)]">Body type</span>
              <span className="font-medium">{bodyType}</span>
            </div>
            <div className="text-[12px] text-[var(--ds-text-3)] pt-3 border-t border-[var(--border-subtle)]">
              Recipients: <span className="font-mono tabular-nums text-[var(--ds-text-1)] font-medium">{recipientCount}</span>
            </div>
          </div>
        </DSCard>
      </div>

      {/* Sticky action bar */}
      <div className="fixed bottom-0 left-0 lg:left-[244px] right-0 z-30 frost border-t border-[var(--border-subtle)] px-4 py-3 flex items-center gap-3">
        <Button size="sm" variant="ghost" onClick={() => { setSubject(''); setBody(''); setSelected([]); setCc([]); setBcc([]); }}>
          Clear
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="outline" onClick={sendTest} disabled={sending}>
          Send test to me
        </Button>
        <Button
          size="sm"
          onClick={() => setConfirm(true)}
          disabled={sending || cooldown > 0 || !subject.trim() || !body.trim() || !hasRecipients}
          title={
            cooldown > 0
              ? `Wait ${cooldown}s before sending another batch`
              : !hasRecipients
                ? 'Add at least one recipient (use + Add for external emails)'
                : undefined
          }
        >
          {sending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
          <Send size={13} className="mr-1.5" />
          {cooldown > 0 ? `Wait ${cooldown}s` : 'Send'}
        </Button>
      </div>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent data-dashboard="true" className="bg-[var(--bg-raised)] border-[var(--border-subtle)]">
          <AlertDialogHeader>
            <AlertDialogTitle>Send this email?</AlertDialogTitle>
            <AlertDialogDescription>
              This will email <span className="font-mono tabular-nums">{recipientCount}</span> recipient{recipientCount === 1 ? '' : 's'}. There&apos;s no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={send} disabled={sending}>
              {sending && <Loader2 size={13} className="mr-1.5 animate-spin" />}
              Send now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
