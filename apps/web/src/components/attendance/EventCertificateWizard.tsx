import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  api,
  type CertificateBulkGenerateInput,
  type CertificateBulkGenerateResponse,
  type CertificateTemplate,
  type CertificateRecipient,
  type GuestCertificateRecipient,
  type CertType,
  type CompetitionGenerationStrategy,
  type CompetitionResultsSummaryResponse,
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InlineMarkdown } from '@/components/ui/inline-markdown';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent as ConfirmDialogContent,
  AlertDialogDescription as ConfirmDialogDescription,
  AlertDialogFooter as ConfirmDialogFooter,
  AlertDialogHeader as ConfirmDialogHeader,
  AlertDialogTitle as ConfirmDialogTitle,
} from '@/components/ui/alert-dialog';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';
import {
  Award,
  CheckCircle,
  Users,
  ArrowLeft,
  ArrowRight,
  Loader2,
  Download,
  Mail,
  Trash2,
  XCircle,
  Search,
  Eye,
  UserCheck,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  aggregateCompetitionCandidates,
  buildCompetitionBulkRecipients,
  createDefaultTierConfigs,
  getTierKeyForRank,
  getTierLabel,
  isTeamCompetition,
  resolveCompetitionTemplate,
  type CompetitionCertificatePreviewRow,
  type CompetitionCertificateTierConfigMap,
  type CompetitionCertificateTierKey,
} from './competitionCertificateUtils';

interface EventCertificateWizardProps {
  eventId: string;
  eventName: string;
  token: string;
  hasCompetitionRounds: boolean;
}

interface Signatory {
  id: string;
  name: string;
  title: string;
  signatureUrl?: string | null;
  isActive: boolean;
}

interface GeneratedCert {
  certId: string;
  recipientName: string;
  recipientEmail: string;
  pdfUrl: string | null;
  emailSent: boolean;
  isRevoked?: boolean;
}

interface BulkGeneratedCertResult {
  certId: string;
  name: string;
  email: string;
  pdfUrl?: string | null;
}

interface GenerationSummary {
  generated: number;
  failed: number;
  emailsSent?: number;
  emailsFailed?: number;
  errors: CertificateBulkGenerateResponse['errors'];
}

type CertificateMode = 'attendance' | 'competition';
type WizardStep = 'mode' | 'select' | 'config' | 'signatories' | 'review' | 'manage';
type RecipientFilter = 'all' | 'attended' | 'no_cert';
type AttendanceAudience = 'participants' | 'guests';

const CERT_TYPE_OPTIONS: Array<{ value: CertType; label: string }> = [
  { value: 'PARTICIPATION', label: 'Participation' },
  { value: 'COMPLETION', label: 'Completion' },
  { value: 'WINNER', label: 'Winner' },
  { value: 'SPEAKER', label: 'Speaker' },
];

const TEMPLATE_OPTIONS = [
  { value: 'gold', label: 'Gold' },
  { value: 'dark', label: 'Dark' },
  { value: 'white', label: 'White' },
  { value: 'emerald', label: 'Emerald' },
] as const;

const STRATEGY_OPTIONS: Array<{ value: CompetitionGenerationStrategy; label: string; helper: string }> = [
  {
    value: 'specific_round',
    label: 'Specific Round',
    helper: 'Generate certificates from one finished round exactly as ranked.',
  },
  {
    value: 'best_selected_rounds',
    label: 'Best Across Selected Rounds',
    helper: 'Use each competitor’s highest selected-round score, then rerank globally.',
  },
  {
    value: 'average_selected_rounds',
    label: 'Average Across Selected Rounds',
    helper: 'Average each competitor’s selected-round scores, then rerank globally.',
  },
];

const COMPETITION_TIER_KEYS: CompetitionCertificateTierKey[] = [
  'rank_1',
  'rank_2',
  'rank_3',
  'other_ranked',
];

const stepVariants = {
  enter: { opacity: 0, x: 40 },
  center: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -40 },
};

function isBulkGeneratedCertResult(value: unknown): value is BulkGeneratedCertResult {
  return (
    typeof value === 'object'
    && value !== null
    && 'certId' in value
    && 'name' in value
    && 'email' in value
  );
}

function getStrategyLabel(strategy: CompetitionGenerationStrategy): string {
  return STRATEGY_OPTIONS.find((option) => option.value === strategy)?.label || strategy;
}

export default function EventCertificateWizard({
  eventId,
  eventName,
  token,
  hasCompetitionRounds,
}: EventCertificateWizardProps) {
  const [mode, setMode] = useState<CertificateMode | null>(null);
  const [step, setStep] = useState<WizardStep>('mode');

  const [recipients, setRecipients] = useState<CertificateRecipient[]>([]);
  const [guestRecipients, setGuestRecipients] = useState<GuestCertificateRecipient[]>([]);
  const [stats, setStats] = useState({ totalRegistered: 0, totalAttended: 0, alreadyCertified: 0, eligibleRecipients: 0 });
  const [attendanceEventDays, setAttendanceEventDays] = useState(1);
  const [attendanceDayLabels, setAttendanceDayLabels] = useState<string[]>([]);
  const [minAttendanceDays, setMinAttendanceDays] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedGuestIds, setSelectedGuestIds] = useState<Set<string>>(new Set());
  const [recipientFilter, setRecipientFilter] = useState<RecipientFilter>('no_cert');
  const [recipientSearch, setRecipientSearch] = useState('');
  const [attendanceAudience, setAttendanceAudience] = useState<AttendanceAudience>('participants');
  const [includeGuestNonAttendees, setIncludeGuestNonAttendees] = useState(false);
  const [loadingRecipients, setLoadingRecipients] = useState(false);

  const [competitionSummary, setCompetitionSummary] = useState<CompetitionResultsSummaryResponse | null>(null);
  const [competitionError, setCompetitionError] = useState<string | null>(null);
  const [loadingCompetition, setLoadingCompetition] = useState(false);
  const [competitionStrategy, setCompetitionStrategy] = useState<CompetitionGenerationStrategy>('specific_round');
  const [selectedRoundIds, setSelectedRoundIds] = useState<string[]>([]);
  const [competitionIncludedUserIds, setCompetitionIncludedUserIds] = useState<Set<string>>(new Set());
  const [competitionTierConfigs, setCompetitionTierConfigs] = useState<CompetitionCertificateTierConfigMap | null>(null);

  const [signatories, setSignatories] = useState<Signatory[]>([]);
  const [loadingSignatories, setLoadingSignatories] = useState(false);
  const [primarySignatoryId, setPrimarySignatoryId] = useState<string | null>(null);
  const [customPrimary, setCustomPrimary] = useState({ name: '', title: '', imageUrl: '' });
  const [useCustomPrimary, setUseCustomPrimary] = useState(false);
  const [facultySignatoryId, setFacultySignatoryId] = useState<string | null>(null);
  const [customFaculty, setCustomFaculty] = useState({ name: '', title: '', imageUrl: '' });
  const [useCustomFaculty, setUseCustomFaculty] = useState(false);
  const [facultyExistingMode, setFacultyExistingMode] = useState(false);
  const [attendanceCertType, setAttendanceCertType] = useState<CertType>('PARTICIPATION');
  const [attendanceTemplate, setAttendanceTemplate] = useState<CertificateTemplate>('gold');
  const [attendancePosition, setAttendancePosition] = useState('');
  const [attendanceDomain, setAttendanceDomain] = useState('');
  const [attendanceDescription, setAttendanceDescription] = useState('');
  const [attendanceEventName, setAttendanceEventName] = useState('');
  const [competitionDomain, setCompetitionDomain] = useState('');
  const [sendEmail, setSendEmail] = useState(true);

  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  const [generatedCerts, setGeneratedCerts] = useState<GeneratedCert[]>([]);
  const [managementSearch, setManagementSearch] = useState('');
  const [managementSelected, setManagementSelected] = useState<Set<string>>(new Set());
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    action: 'revoke' | 'delete';
    certId: string;
    recipientName: string;
  } | null>(null);
  const [generateConfirmOpen, setGenerateConfirmOpen] = useState(false);
  const [bulkResending, setBulkResending] = useState(false);
  const [bulkResendProgress, setBulkResendProgress] = useState({ completed: 0, total: 0, failed: 0 });
  const [generationSummary, setGenerationSummary] = useState<GenerationSummary | null>(null);

  const deferredRecipientSearch = useDeferredValue(recipientSearch);
  const deferredManagementSearch = useDeferredValue(managementSearch);

  const competitionRounds = competitionSummary?.rounds ?? [];
  const competitionTeamMode = useMemo(
    () => isTeamCompetition(competitionRounds),
    [competitionRounds],
  );

  const competitionCandidates = useMemo(
    () => mode === 'competition'
      ? aggregateCompetitionCandidates(competitionRounds, competitionStrategy, selectedRoundIds)
      : [],
    [competitionRounds, competitionStrategy, mode, selectedRoundIds],
  );

  const competitionIncludedCount = useMemo(
    () => competitionCandidates.flatMap((candidate) => candidate.members)
      .filter((member) => competitionIncludedUserIds.has(member.userId))
      .length,
    [competitionCandidates, competitionIncludedUserIds],
  );

  const competitionPreview = useMemo(
    () => competitionTierConfigs
      ? buildCompetitionBulkRecipients({
          candidates: competitionCandidates,
          includedUserIds: competitionIncludedUserIds,
          tierConfigs: competitionTierConfigs,
          eventName,
        })
      : { previewRows: [] as CompetitionCertificatePreviewRow[], recipients: [] },
    [competitionCandidates, competitionIncludedUserIds, competitionTierConfigs, eventName],
  );

  const filteredRecipients = useMemo(() => {
    let list = recipients;
    if (recipientFilter === 'attended') list = list.filter((recipient) => recipient.attended);
    if (recipientFilter === 'no_cert') list = list.filter((recipient) => !recipient.hasCertificate);
    if (deferredRecipientSearch.trim()) {
      const query = deferredRecipientSearch.toLowerCase();
      list = list.filter((recipient) =>
        recipient.userName.toLowerCase().includes(query)
        || recipient.userEmail.toLowerCase().includes(query),
      );
    }
    return list;
  }, [deferredRecipientSearch, recipientFilter, recipients]);

  const filteredGuestRecipients = useMemo(() => {
    let list = guestRecipients;
    if (!includeGuestNonAttendees) {
      list = list.filter((recipient) => recipient.attended);
    }
    if (recipientFilter === 'attended') list = list.filter((recipient) => recipient.attended);
    if (recipientFilter === 'no_cert') list = list.filter((recipient) => !recipient.existingCertificateId);
    if (deferredRecipientSearch.trim()) {
      const query = deferredRecipientSearch.toLowerCase();
      list = list.filter((recipient) =>
        recipient.name.toLowerCase().includes(query)
        || recipient.email.toLowerCase().includes(query)
        || recipient.role.toLowerCase().includes(query),
      );
    }
    return list;
  }, [deferredRecipientSearch, guestRecipients, includeGuestNonAttendees, recipientFilter]);

  const filteredCerts = useMemo(() => {
    if (!deferredManagementSearch.trim()) return generatedCerts;
    const query = deferredManagementSearch.toLowerCase();
    return generatedCerts.filter((certificate) =>
      certificate.recipientName.toLowerCase().includes(query)
      || certificate.recipientEmail.toLowerCase().includes(query)
      || certificate.certId.toLowerCase().includes(query),
    );
  }, [deferredManagementSearch, generatedCerts]);

  const selectedPrimarySignatory = signatories.find((signatory) => signatory.id === primarySignatoryId);
  const selectedFacultySignatory = signatories.find((signatory) => signatory.id === facultySignatoryId);
  const selectedRecipientEmails = useMemo(
    () => [
      ...recipients
        .filter((recipient) => selectedIds.has(recipient.registrationId))
        .map((recipient) => recipient.userEmail),
      ...guestRecipients
        .filter((recipient) => selectedGuestIds.has(recipient.invitationId))
        .map((recipient) => recipient.email),
    ],
    [guestRecipients, recipients, selectedGuestIds, selectedIds],
  );

  const competitionSelectedRoundsValid = useMemo(() => {
    if (competitionStrategy === 'specific_round') {
      return selectedRoundIds.length === 1;
    }
    if (competitionStrategy === 'average_selected_rounds') {
      return selectedRoundIds.length >= 2;
    }
    return selectedRoundIds.length >= 1;
  }, [competitionStrategy, selectedRoundIds]);

  const currentRecipientCount = mode === 'competition'
    ? competitionPreview.previewRows.length
    : selectedIds.size + selectedGuestIds.size;

  const fetchRecipients = useCallback(async () => {
    setLoadingRecipients(true);
    try {
      const data = await api.getAttendanceCertRecipients(
        eventId,
        token,
        typeof minAttendanceDays === 'number' ? minAttendanceDays : undefined,
        includeGuestNonAttendees,
      );
      const eventDays = Math.min(Math.max(data.eventDays ?? 1, 1), 10);
      if (eventDays <= 1 && minAttendanceDays !== null) {
        setMinAttendanceDays(null);
      }
      setAttendanceEventDays(eventDays);
      setAttendanceDayLabels(Array.isArray(data.dayLabels) ? data.dayLabels : []);
      setRecipients(data.participants ?? data.recipients);
      setGuestRecipients(data.guests ?? []);
      setStats({
        totalRegistered: data.stats.totalRegistered,
        totalAttended: data.stats.totalAttended,
        alreadyCertified: data.stats.alreadyCertified,
        eligibleRecipients: data.stats.eligibleRecipients ?? (data.participants ?? data.recipients).length,
      });
      setSelectedIds(new Set(
        (data.participants ?? data.recipients)
          .filter((recipient) =>
            recipient.attended
            && !recipient.hasCertificate
            && (typeof minAttendanceDays !== 'number'
              || (recipient.daysAttended ?? 0) >= minAttendanceDays))
          .map((recipient) => recipient.registrationId),
      ));
      setSelectedGuestIds(new Set());
    } catch {
      setRecipients([]);
      setGuestRecipients([]);
      setStats({ totalRegistered: 0, totalAttended: 0, alreadyCertified: 0, eligibleRecipients: 0 });
      setAttendanceEventDays(1);
      setAttendanceDayLabels([]);
      setSelectedGuestIds(new Set());
    } finally {
      setLoadingRecipients(false);
    }
  }, [eventId, includeGuestNonAttendees, minAttendanceDays, token]);

  const fetchCompetitionSummary = useCallback(async () => {
    setLoadingCompetition(true);
    setCompetitionError(null);
    try {
      const data = await api.getCompetitionResultsSummary(eventId, token);
      setCompetitionSummary(data);
    } catch (error) {
      setCompetitionSummary(null);
      setCompetitionError(error instanceof Error ? error.message : 'Failed to load competition results.');
    } finally {
      setLoadingCompetition(false);
    }
  }, [eventId, token]);

  const fetchSignatories = useCallback(async () => {
    setLoadingSignatories(true);
    try {
      const data = await api.getSignatories(token);
      setSignatories(data as Signatory[]);
    } catch {
      setSignatories([]);
    } finally {
      setLoadingSignatories(false);
    }
  }, [token]);

  useEffect(() => {
    if (mode === 'attendance' && step === 'select') {
      void fetchRecipients();
    }
  }, [fetchRecipients, mode, step]);

  useEffect(() => {
    if (mode === 'competition' && step === 'select' && !competitionSummary && !loadingCompetition) {
      void fetchCompetitionSummary();
    }
  }, [competitionSummary, fetchCompetitionSummary, loadingCompetition, mode, step]);

  useEffect(() => {
    if (step === 'signatories' && signatories.length === 0) {
      void fetchSignatories();
    }
  }, [fetchSignatories, signatories.length, step]);

  useEffect(() => {
    if (mode !== 'competition' || competitionRounds.length === 0) return;

    if (selectedRoundIds.length === 0) {
      setSelectedRoundIds([competitionRounds[0].roundId]);
    }

    if (!competitionTierConfigs) {
      setCompetitionTierConfigs(createDefaultTierConfigs(competitionTeamMode));
    }
  }, [competitionRounds, competitionTeamMode, competitionTierConfigs, mode, selectedRoundIds.length]);

  useEffect(() => {
    if (competitionStrategy === 'specific_round' && selectedRoundIds.length > 1) {
      setSelectedRoundIds((current) => current.length > 0 ? [current[0]] : current);
    }
  }, [competitionStrategy, selectedRoundIds]);

  useEffect(() => {
    if (mode !== 'competition') return;

    setCompetitionIncludedUserIds(new Set(
      competitionCandidates.flatMap((candidate) =>
        candidate.members.filter((member) => member.attended).map((member) => member.userId),
      ),
    ));
  }, [competitionCandidates, competitionStrategy, mode, selectedRoundIds]);

  function resetForNewGeneration() {
    setMode(null);
    setStep('mode');
    setGenerateError(null);
    setGenerateConfirmOpen(false);
    setGeneratedCerts([]);
    setManagementSelected(new Set());
    setGenerationSummary(null);
    setSendEmail(true);
    setAttendanceCertType('PARTICIPATION');
    setAttendanceTemplate('gold');
    setAttendancePosition('');
    setAttendanceDomain('');
    setAttendanceDescription('');
    setAttendanceEventName('');
    setCompetitionDomain('');
    setMinAttendanceDays(null);
    setAttendanceEventDays(1);
    setAttendanceDayLabels([]);
    setGuestRecipients([]);
    setSelectedGuestIds(new Set());
    setAttendanceAudience('participants');
    setIncludeGuestNonAttendees(false);
  }

  function selectMode(nextMode: CertificateMode) {
    setMode(nextMode);
    setStep('select');
    setGenerateError(null);
    setGenerateConfirmOpen(false);
    setGenerationSummary(null);
  }

  function toggleAttendanceRecipient(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleGuestRecipient(id: string) {
    setSelectedGuestIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleAllAttendanceRecipients() {
    const visibleIds = filteredRecipients.map((recipient) => recipient.registrationId);
    const allSelected = visibleIds.every((id) => selectedIds.has(id));

    setSelectedIds((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  function toggleAllGuestRecipients() {
    const visibleIds = filteredGuestRecipients.map((recipient) => recipient.invitationId);
    const allSelected = visibleIds.every((id) => selectedGuestIds.has(id));

    setSelectedGuestIds((current) => {
      const next = new Set(current);
      for (const id of visibleIds) {
        if (allSelected) {
          next.delete(id);
        } else {
          next.add(id);
        }
      }
      return next;
    });
  }

  function updateGuestRecipientType(invitationId: string, certificateType: CertType) {
    setGuestRecipients((current) => current.map((recipient) => (
      recipient.invitationId === invitationId
        ? { ...recipient, certificateType }
        : recipient
    )));
  }

  function toggleCompetitionUser(userId: string) {
    setCompetitionIncludedUserIds((current) => {
      const next = new Set(current);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  }

  function toggleRoundSelection(roundId: string) {
    if (competitionStrategy === 'specific_round') {
      setSelectedRoundIds([roundId]);
      return;
    }

    setSelectedRoundIds((current) => {
      if (current.includes(roundId)) {
        return current.filter((id) => id !== roundId);
      }
      return [...current, roundId];
    });
  }

  function updateTierConfig(
    tierKey: CompetitionCertificateTierKey,
    patch: Partial<CompetitionCertificateTierConfigMap[CompetitionCertificateTierKey]>,
  ) {
    setCompetitionTierConfigs((current) => {
      if (!current) return current;
      return {
        ...current,
        [tierKey]: {
          ...current[tierKey],
          ...patch,
        },
      };
    });
  }

  async function handleGenerate() {
    if (!mode) return;

    setGenerating(true);
    setGenerateError(null);

    try {
      let body: CertificateBulkGenerateInput;

      if (mode === 'competition') {
        if (competitionPreview.recipients.length === 0) {
          throw new Error('Select at least one eligible competition participant before generating certificates.');
        }

        body = {
          eventId,
          eventName,
          recipients: competitionPreview.recipients,
          source: 'competition',
          generationStrategy: competitionStrategy,
          selectedRoundIds,
          domain: competitionDomain.trim() || undefined,
          sendEmail,
        };
      } else {
        const attendancePositionValue = attendancePosition.trim();
        const selectedParticipantRecipients = recipients
          .filter((recipient) => selectedIds.has(recipient.registrationId))
          .map((recipient) => ({
            name: recipient.userName,
            email: recipient.userEmail,
            userId: recipient.userId,
            ...(attendancePositionValue ? { position: attendancePositionValue } : {}),
          }));
        const selectedGuestRecipientsForGeneration = guestRecipients
          .filter((recipient) => selectedGuestIds.has(recipient.invitationId))
          .map((recipient) => ({
            name: recipient.name,
            email: recipient.email,
            userId: recipient.userId,
            type: recipient.certificateType,
            position: recipient.role,
          }));

        body = {
          eventId,
          eventName: attendanceEventName.trim() || eventName,
          recipients: [
            ...selectedParticipantRecipients,
            ...selectedGuestRecipientsForGeneration,
          ],
          type: attendanceCertType,
          template: attendanceTemplate,
          domain: attendanceDomain.trim() || undefined,
          description: attendanceDescription.trim() || undefined,
          sendEmail,
          source: 'attendance',
        };
      }

      if (useCustomPrimary) {
        if (customPrimary.name) body.signatoryName = customPrimary.name;
        if (customPrimary.title) body.signatoryTitle = customPrimary.title;
        if (customPrimary.imageUrl) body.signatoryCustomImageUrl = customPrimary.imageUrl;
      } else if (primarySignatoryId) {
        body.signatoryId = primarySignatoryId;
      }

      if (useCustomFaculty) {
        if (customFaculty.name) body.facultyName = customFaculty.name;
        if (customFaculty.title) body.facultyTitle = customFaculty.title;
        if (customFaculty.imageUrl) body.facultyCustomImageUrl = customFaculty.imageUrl;
      } else if (facultySignatoryId) {
        body.facultySignatoryId = facultySignatoryId;
      }

      const result = await api.bulkGenerateCertificates(body, token);
      const certificates: GeneratedCert[] = result.results
        .filter(isBulkGeneratedCertResult)
        .map((generated) => ({
          certId: generated.certId,
          recipientName: generated.name,
          recipientEmail: generated.email,
          pdfUrl: generated.pdfUrl ?? null,
          emailSent: sendEmail,
        }));

      setGeneratedCerts(certificates);
      setGenerationSummary({
        generated: result.generated,
        failed: result.failed,
        emailsSent: result.emailsSent,
        emailsFailed: result.emailsFailed,
        errors: result.errors,
      });
      setGenerateConfirmOpen(false);
      setStep('manage');

      if (result.failed > 0) {
        toast.warning(`Generated ${result.generated} certificates with ${result.failed} skipped recipient${result.failed === 1 ? '' : 's'}.`);
      } else {
        toast.success(`Generated ${result.generated} certificate${result.generated === 1 ? '' : 's'}.`);
      }
    } catch (error) {
      setGenerateError(error instanceof Error ? error.message : 'Certificate generation failed.');
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownload(certId: string) {
    setActionLoading((current) => ({ ...current, [`dl-${certId}`]: true }));
    try {
      const result = await api.downloadCertificate(certId, token);
      if (result?.url) {
        window.open(result.url, '_blank');
      }
    } catch {
      toast.error('Failed to download certificate');
    } finally {
      setActionLoading((current) => ({ ...current, [`dl-${certId}`]: false }));
    }
  }

  async function handleResendEmail(certId: string) {
    setActionLoading((current) => ({ ...current, [`mail-${certId}`]: true }));
    try {
      await api.resendCertificateEmail(certId, token);
      setGeneratedCerts((current) =>
        current.map((certificate) => certificate.certId === certId ? { ...certificate, emailSent: true } : certificate),
      );
      toast.success('Certificate email resent');
    } catch {
      toast.error('Failed to resend email');
    } finally {
      setActionLoading((current) => ({ ...current, [`mail-${certId}`]: false }));
    }
  }

  async function handleConfirmAction() {
    if (!confirmDialog) return;

    const { action, certId } = confirmDialog;
    setActionLoading((current) => ({ ...current, [`confirm-${certId}`]: true }));

    try {
      if (action === 'revoke') {
        await api.revokeCertificate(certId, undefined, token);
        setGeneratedCerts((current) =>
          current.map((certificate) => certificate.certId === certId ? { ...certificate, isRevoked: true } : certificate),
        );
      } else {
        await api.deleteCertificate(certId, token);
        setGeneratedCerts((current) => current.filter((certificate) => certificate.certId !== certId));
      }

      toast.success(action === 'revoke' ? 'Certificate revoked' : 'Certificate deleted');
    } catch {
      toast.error(`Failed to ${action} certificate`);
    } finally {
      setActionLoading((current) => ({ ...current, [`confirm-${certId}`]: false }));
      setConfirmDialog(null);
    }
  }

  async function handleBulkResend() {
    const ids = Array.from(managementSelected);
    let failed = 0;

    setBulkResending(true);
    setBulkResendProgress({ completed: 0, total: ids.length, failed: 0 });

    for (const certId of ids) {
      try {
        await api.resendCertificateEmail(certId, token);
        setGeneratedCerts((current) =>
          current.map((certificate) => certificate.certId === certId ? { ...certificate, emailSent: true } : certificate),
        );
      } catch {
        failed += 1;
      } finally {
        setBulkResendProgress((current) => ({
          ...current,
          completed: Math.min(current.completed + 1, ids.length),
          failed,
        }));
      }
    }

    setBulkResending(false);
    setManagementSelected(new Set());

    if (failed > 0) {
      toast.warning(`Resent ${ids.length - failed} of ${ids.length} certificate email${ids.length === 1 ? '' : 's'}.`);
      return;
    }

    toast.success(`Resent ${ids.length} certificate email${ids.length === 1 ? '' : 's'}.`);
  }

  function toggleManagementCert(certId: string) {
    setManagementSelected((current) => {
      const next = new Set(current);
      if (next.has(certId)) {
        next.delete(certId);
      } else {
        next.add(certId);
      }
      return next;
    });
  }

  function StepIndicator() {
    const labels = mode === 'competition'
      ? ['Mode', 'Results', 'Configure', 'Signatories', 'Review']
      : mode === 'attendance'
        ? ['Mode', 'Recipients', 'Signatories', 'Review']
        : ['Mode'];

    const currentIndexMap: Record<WizardStep, number> = {
      mode: 1,
      select: 2,
      config: 3,
      signatories: mode === 'competition' ? 4 : 3,
      review: mode === 'competition' ? 5 : 4,
      manage: mode === 'competition' ? 6 : 5,
    };

    const currentNumber = currentIndexMap[step];

    return (
      <div className="mb-6 flex items-center justify-center gap-2">
        {labels.map((label, index) => {
          const stepNumber = index + 1;
          return (
            <div key={label} className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  currentNumber > stepNumber
                    ? 'bg-green-600 text-white'
                    : currentNumber === stepNumber
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-200 text-gray-500 dark:bg-gray-700 dark:text-gray-400'
                }`}
              >
                {currentNumber > stepNumber ? <CheckCircle className="h-4 w-4" /> : stepNumber}
              </div>
              <span
                className={`hidden text-sm sm:inline ${
                  currentNumber === stepNumber
                    ? 'font-semibold text-gray-900 dark:text-white'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {label}
              </span>
              {stepNumber < labels.length && (
                <div
                  className={`h-px w-8 ${
                    currentNumber > stepNumber ? 'bg-green-400' : 'bg-gray-300 dark:bg-gray-600'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function renderModeStep() {
    return (
      <motion.div
        key="mode-step"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        <p className="text-sm text-gray-500">
          Choose whether you want to issue attendance certificates or competition-result certificates for {eventName}.
        </p>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <button
            type="button"
            className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-left transition hover:border-amber-300 hover:shadow-sm"
            onClick={() => selectMode('attendance')}
          >
            <div className="mb-3 flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-amber-600" />
              <span className="font-semibold text-gray-900">Attendance Certificates</span>
            </div>
            <p className="text-sm text-gray-600">
              Use the existing attendance-gated workflow to issue participation certificates to registered attendees.
            </p>
          </button>

          {hasCompetitionRounds && (
            <button
              type="button"
              className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-left transition hover:border-blue-300 hover:shadow-sm"
              onClick={() => selectMode('competition')}
            >
              <div className="mb-3 flex items-center gap-2">
                <Award className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-gray-900">Competition Certificates</span>
              </div>
              <p className="text-sm text-gray-600">
                Generate rank-aware certificates from finished competition rounds, with attendance gating and per-tier customization.
              </p>
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  function renderAttendanceSelection() {
    if (loadingRecipients) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Loader2 className="mb-3 h-8 w-8 animate-spin" />
          <p>Loading recipients...</p>
        </div>
      );
    }

    const activeRecipientCount = attendanceAudience === 'participants' ? recipients.length : guestRecipients.length;
    const filterOptions: Array<{ value: RecipientFilter; label: string }> = attendanceAudience === 'participants'
      ? [
          { value: 'all', label: `All (${recipients.length})` },
          { value: 'attended', label: `Attended (${recipients.filter((recipient) => recipient.attended).length})` },
          { value: 'no_cert', label: `No Cert (${recipients.filter((recipient) => !recipient.hasCertificate).length})` },
        ]
      : [
          { value: 'all', label: `All (${guestRecipients.length})` },
          { value: 'attended', label: `Attended (${guestRecipients.filter((recipient) => recipient.attended).length})` },
          { value: 'no_cert', label: `No Cert (${guestRecipients.filter((recipient) => !recipient.existingCertificateId).length})` },
        ];

    return (
      <motion.div
        key="attendance-select"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
      >
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="flex items-center gap-3 p-4">
              <Users className="h-5 w-5 shrink-0 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalRegistered}</p>
                <p className="text-xs text-gray-500">Registered</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-green-200 dark:border-green-800">
            <CardContent className="flex items-center gap-3 p-4">
              <UserCheck className="h-5 w-5 shrink-0 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{stats.totalAttended}</p>
                <p className="text-xs text-gray-500">Attended</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="flex items-center gap-3 p-4">
              <Award className="h-5 w-5 shrink-0 text-amber-500" />
              <div>
                <p className="text-2xl font-bold">{stats.alreadyCertified}</p>
                <p className="text-xs text-gray-500">Attendance Certs Issued</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-purple-200 dark:border-purple-800">
            <CardContent className="flex items-center gap-3 p-4">
              <Award className="h-5 w-5 shrink-0 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{guestRecipients.length}</p>
                <p className="text-xs text-gray-500">Guest Candidates</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {attendanceEventDays > 1 && (
          <div className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 sm:flex-row sm:items-center sm:justify-between">
            <p>
              Multi-day event: {attendanceEventDays} day{attendanceEventDays === 1 ? '' : 's'} tracked.
            </p>
            <div className="flex items-center gap-2">
              <label htmlFor="min-attendance-days" className="text-xs font-medium text-blue-900">
                Minimum days for eligibility
              </label>
              <select
                id="min-attendance-days"
                value={minAttendanceDays ?? ''}
                onChange={(event) => {
                  const value = event.target.value;
                  setMinAttendanceDays(value ? Number.parseInt(value, 10) : null);
                }}
                className="h-8 rounded-md border border-blue-300 bg-white px-2 text-xs text-blue-900 focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value="">Any</option>
                {Array.from({ length: attendanceEventDays }, (_, index) => index + 1).map((dayCount) => (
                  <option key={dayCount} value={dayCount}>
                    {dayCount} day{dayCount === 1 ? '' : 's'}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <Tabs value={attendanceAudience} onValueChange={(value) => setAttendanceAudience(value as AttendanceAudience)} className="w-full">
            <TabsList className="grid w-full max-w-xs grid-cols-2">
              <TabsTrigger value="participants">Participants</TabsTrigger>
              <TabsTrigger value="guests">Guests</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row">
          <div className="flex gap-1">
            {filterOptions.map((option) => (
              <Button
                key={option.value}
                variant={recipientFilter === option.value ? 'default' : 'outline'}
                size="sm"
                onClick={() => setRecipientFilter(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              placeholder="Search by name or email..."
              value={recipientSearch}
              onChange={(event) => setRecipientSearch(event.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        {attendanceAudience === 'guests' && (
          <div className="mb-4 flex items-center justify-between rounded-lg border border-purple-200 bg-purple-50 px-4 py-3 text-sm text-purple-900">
            <div>
              <p className="font-medium">Guest handling</p>
              <p className="text-xs text-purple-700">Include VIPs even without scanned attendance when needed.</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs font-medium">Force include non-attendees</span>
              <Switch checked={includeGuestNonAttendees} onCheckedChange={setIncludeGuestNonAttendees} />
            </div>
          </div>
        )}

        {attendanceAudience === 'participants' ? (
          <div className="overflow-hidden rounded-lg border dark:border-gray-700">
            <div className="max-h-80 overflow-x-auto overflow-y-auto">
              <table className="min-w-[560px] w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="w-10 p-3 text-left">
                      <input
                        type="checkbox"
                        checked={filteredRecipients.length > 0 && filteredRecipients.every((recipient) => selectedIds.has(recipient.registrationId))}
                        onChange={toggleAllAttendanceRecipients}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="p-3 text-left">Recipient</th>
                    <th className="hidden p-3 text-left sm:table-cell">Status</th>
                    {attendanceEventDays > 1 && <th className="hidden p-3 text-left sm:table-cell">Days</th>}
                    <th className="hidden p-3 text-left md:table-cell">Certificate</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {filteredRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={attendanceEventDays > 1 ? 5 : 4} className="p-8 text-center text-gray-400">
                        No recipients match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredRecipients.map((recipient) => (
                      <tr
                        key={recipient.registrationId}
                        className={`transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                          selectedIds.has(recipient.registrationId)
                            ? 'bg-blue-50/50 dark:bg-blue-900/10'
                            : ''
                        }`}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(recipient.registrationId)}
                            onChange={() => toggleAttendanceRecipient(recipient.registrationId)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            {recipient.userAvatar ? (
                              <img src={recipient.userAvatar} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                            ) : (
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-medium dark:bg-gray-700">
                                {recipient.userName.charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="truncate font-medium">{recipient.userName}</p>
                              <p className="truncate text-xs text-gray-500">{recipient.userEmail}</p>
                            </div>
                          </div>
                        </td>
                        <td className="hidden p-3 sm:table-cell">
                          {recipient.attended ? (
                            <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                              <CheckCircle className="mr-1 h-3 w-3" />
                              Attended
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-gray-300 text-gray-500">
                              Not Attended
                            </Badge>
                          )}
                        </td>
                        {attendanceEventDays > 1 && (
                          <td className="hidden p-3 sm:table-cell">
                            <div className="flex flex-col gap-1">
                              <Badge variant="outline" className="w-fit">
                                {recipient.daysAttended ?? 0}/{attendanceEventDays} day{attendanceEventDays === 1 ? '' : 's'}
                              </Badge>
                              {(recipient.dayAttendances?.length ?? 0) > 0 && (
                                <p className="max-w-[220px] truncate text-xs text-gray-500">
                                  {recipient.dayAttendances
                                    ?.filter((day) => day.attended)
                                    .map((day) => attendanceDayLabels[day.dayNumber - 1] || `Day ${day.dayNumber}`)
                                    .join(', ')}
                                </p>
                              )}
                            </div>
                          </td>
                        )}
                        <td className="hidden p-3 md:table-cell">
                          {recipient.hasCertificate ? (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              <Award className="mr-1 h-3 w-3" />
                              {recipient.certificateType || recipient.certificateId || 'Issued'}
                            </Badge>
                          ) : (
                            <span className="text-xs text-gray-400">None</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border dark:border-gray-700">
            <div className="max-h-80 overflow-x-auto overflow-y-auto">
              <table className="min-w-[700px] w-full text-sm">
                <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="w-10 p-3 text-left">
                      <input
                        type="checkbox"
                        checked={filteredGuestRecipients.length > 0 && filteredGuestRecipients.every((recipient) => selectedGuestIds.has(recipient.invitationId))}
                        onChange={toggleAllGuestRecipients}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="p-3 text-left">Guest</th>
                    <th className="p-3 text-left">Status</th>
                    <th className="p-3 text-left">Role</th>
                    <th className="p-3 text-left">Certificate Type</th>
                    <th className="p-3 text-left">Certificate</th>
                  </tr>
                </thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {filteredGuestRecipients.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-gray-400">
                        No guest recipients match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredGuestRecipients.map((recipient) => (
                      <tr
                        key={recipient.invitationId}
                        className={selectedGuestIds.has(recipient.invitationId) ? 'bg-purple-50/50 dark:bg-purple-900/10' : ''}
                      >
                        <td className="p-3">
                          <input
                            type="checkbox"
                            checked={selectedGuestIds.has(recipient.invitationId)}
                            onChange={() => toggleGuestRecipient(recipient.invitationId)}
                            className="rounded border-gray-300"
                          />
                        </td>
                        <td className="p-3">
                          <div>
                            <p className="font-medium">{recipient.name}</p>
                            <p className="text-xs text-gray-500">{recipient.email}</p>
                            {recipient.designation && (
                              <p className="text-xs text-gray-400">{recipient.designation}</p>
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={recipient.attended ? 'border-green-300 text-green-700' : 'border-amber-300 text-amber-700'}>
                            {recipient.attended ? 'Attended' : 'Force include'}
                          </Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline">{recipient.role}</Badge>
                        </td>
                        <td className="p-3">
                          <select
                            value={recipient.certificateType}
                            onChange={(event) => updateGuestRecipientType(recipient.invitationId, event.target.value as CertType)}
                            className="h-9 rounded-md border border-gray-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                          >
                            {CERT_TYPE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3">
                          {recipient.existingCertificateId ? (
                            <Badge className="bg-amber-100 text-amber-800">
                              <Award className="mr-1 h-3 w-3" />
                              Issued
                            </Badge>
                          ) : recipient.certificateEnabled ? (
                            <span className="text-xs text-gray-500">Eligible</span>
                          ) : (
                            <span className="text-xs text-gray-400">Disabled</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep('mode')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <div className="flex items-center gap-4">
            <p className="text-sm text-gray-500">
              <span className="font-medium text-gray-900 dark:text-white">
                {attendanceAudience === 'participants' ? selectedIds.size : selectedGuestIds.size}
              </span> of {activeRecipientCount} {attendanceAudience} selected
            </p>
            <Button onClick={() => setStep('signatories')} disabled={selectedIds.size + selectedGuestIds.size === 0}>
              Next
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  function renderCompetitionSelection() {
    if (loadingCompetition) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Loader2 className="mb-3 h-8 w-8 animate-spin" />
          <p>Loading competition results...</p>
        </div>
      );
    }

    if (competitionError) {
      return (
        <div className="space-y-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-900/10 dark:text-red-300">
          <p>{competitionError}</p>
          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={() => setStep('mode')}>
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Back
            </Button>
            <Button onClick={() => void fetchCompetitionSummary()}>
              Retry
            </Button>
          </div>
        </div>
      );
    }

    return (
      <motion.div
        key="competition-select"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Generation Strategy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {STRATEGY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`rounded-lg border p-4 text-left transition ${
                    competitionStrategy === option.value
                      ? 'border-blue-400 bg-blue-50 shadow-sm'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                  onClick={() => setCompetitionStrategy(option.value)}
                >
                  <p className="font-medium text-gray-900">{option.label}</p>
                  <p className="mt-1 text-sm text-gray-500">{option.helper}</p>
                </button>
              ))}
            </div>
            {competitionStrategy === 'average_selected_rounds' && (
              <p className="text-xs text-amber-700">
                Average mode requires at least two finished rounds. Scores are averaged across the rounds each competitor submitted in.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Finished Rounds</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {competitionRounds.length === 0 ? (
              <p className="text-sm text-gray-500">No finished competition rounds are available for this event.</p>
            ) : (
              competitionRounds.map((round) => {
                const roundSelected = selectedRoundIds.includes(round.roundId);
                return (
                  <div
                    key={round.roundId}
                    className={`rounded-lg border p-4 ${
                      roundSelected
                        ? 'border-blue-300 bg-blue-50/60'
                        : 'border-gray-200'
                    }`}
                  >
                    <div className="mb-3 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-gray-900">{round.title}</p>
                        <p className="text-sm text-gray-500">{round.submissions.length} ranked submission{round.submissions.length === 1 ? '' : 's'}</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        <input
                          type="checkbox"
                          checked={roundSelected}
                          onChange={() => toggleRoundSelection(round.roundId)}
                          className="rounded border-gray-300"
                        />
                        Select
                      </label>
                    </div>

                    <div className="space-y-2">
                      {round.submissions.map((submission) => (
                        <div key={submission.submissionId} className="rounded-md border border-gray-200 bg-white p-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="outline">Rank {submission.rank ?? '-'}</Badge>
                            <Badge variant="outline">Score {submission.score ?? '-'}</Badge>
                            <span className="font-medium text-gray-900">
                              {submission.teamName || submission.userName || submission.userEmail}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-2">
                            {(submission.members ?? []).length > 0 ? (
                              submission.members?.map((member) => (
                                <div key={member.userId} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                                  {member.name} · {member.attended ? 'Present' : 'Absent'}
                                </div>
                              ))
                            ) : (
                              <div className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-700">
                                {submission.userName} · {submission.attended ? 'Present' : 'Absent'}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Current Certificate Candidates</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!competitionSelectedRoundsValid ? (
              <p className="text-sm text-gray-500">
                {competitionStrategy === 'specific_round'
                  ? 'Select exactly one round to continue.'
                  : competitionStrategy === 'average_selected_rounds'
                    ? 'Select at least two rounds to calculate averages.'
                    : 'Select at least one finished round to continue.'}
              </p>
            ) : competitionCandidates.length === 0 ? (
              <p className="text-sm text-gray-500">No ranked competitors were found for the current selection.</p>
            ) : (
              <>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
                  {competitionIncludedCount} certificate recipient{competitionIncludedCount === 1 ? '' : 's'} currently selected. Absent members start unchecked, but you can include them manually below.
                </div>

                <div className="space-y-3">
                  {competitionCandidates.map((candidate) => (
                    <div key={candidate.competitorKey} className="rounded-lg border border-gray-200 p-4">
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <Badge variant="outline">Rank {candidate.rank}</Badge>
                        <Badge variant="outline">Score {candidate.score}</Badge>
                        <span className="font-semibold text-gray-900">{candidate.displayName}</span>
                        <span className="text-sm text-gray-500">{candidate.strategySourceLabel}</span>
                      </div>

                      <div className="space-y-2">
                        {candidate.members.map((member) => (
                          <label
                            key={member.userId}
                            className="flex items-center justify-between rounded-md border border-gray-200 px-3 py-2"
                          >
                            <div>
                              <p className="font-medium text-gray-900">{member.name}</p>
                              <p className="text-xs text-gray-500">{member.email}</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <Badge
                                variant="outline"
                                className={member.attended
                                  ? 'border-green-300 text-green-700 dark:border-green-700 dark:text-green-400'
                                  : 'border-gray-300 text-gray-500'}
                              >
                                {member.attended ? 'Present' : 'Absent'}
                              </Badge>
                              <input
                                type="checkbox"
                                checked={competitionIncludedUserIds.has(member.userId)}
                                onChange={() => toggleCompetitionUser(member.userId)}
                                className="rounded border-gray-300"
                              />
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep('mode')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => setStep('config')}
            disabled={!competitionSelectedRoundsValid || competitionIncludedCount === 0}
          >
            Next
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  function renderCompetitionConfiguration() {
    const samplePreviewByTier = COMPETITION_TIER_KEYS.reduce<Record<CompetitionCertificateTierKey, string>>((accumulator, tierKey) => {
      const config = competitionTierConfigs?.[tierKey];
      if (!config) {
        accumulator[tierKey] = 'No preview available yet.';
        return accumulator;
      }

      const sampleCandidate = competitionCandidates.find((candidate) => getTierKeyForRank(candidate.rank) === tierKey);
      const sampleMember = sampleCandidate?.members[0];

      if (!sampleCandidate || !sampleMember) {
        accumulator[tierKey] = 'No recipients currently fall into this tier.';
        return accumulator;
      }

      accumulator[tierKey] = resolveCompetitionTemplate(config.descriptionTemplate, {
        name: sampleMember.name,
        teamName: sampleCandidate.teamName,
        position: config.position || undefined,
        eventName,
        roundTitle: sampleCandidate.placeholderRoundTitle,
      });
      return accumulator;
    }, {
      rank_1: '',
      rank_2: '',
      rank_3: '',
      other_ranked: '',
    });

    return (
      <motion.div
        key="competition-config"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          Supported placeholders: <code>{'{name}'}</code>, <code>{'{teamName}'}</code>, <code>{'{position}'}</code>, <code>{'{eventName}'}</code>, <code>{'{roundTitle}'}</code>
          <p className="mt-2 text-xs text-blue-700">
            Description templates also support Markdown (<code>**bold**</code>, <code>*italic*</code>, <code>***bold italic***</code>, <code>~~strikethrough~~</code>).
          </p>
        </div>

        {competitionTierConfigs && COMPETITION_TIER_KEYS.map((tierKey) => (
          <Card key={tierKey}>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{getTierLabel(tierKey)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                <div>
                  <Label htmlFor={`${tierKey}-type`} className="text-xs">Certificate Type</Label>
                  <select
                    id={`${tierKey}-type`}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={competitionTierConfigs[tierKey].type}
                    onChange={(event) => updateTierConfig(tierKey, { type: event.target.value as CertType })}
                  >
                    {CERT_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label htmlFor={`${tierKey}-position`} className="text-xs">Position Text</Label>
                  <Input
                    id={`${tierKey}-position`}
                    value={competitionTierConfigs[tierKey].position}
                    onChange={(event) => updateTierConfig(tierKey, { position: event.target.value })}
                    placeholder="e.g. 1st Place"
                    className="mt-1"
                  />
                </div>

                <div>
                  <Label htmlFor={`${tierKey}-template`} className="text-xs">Template</Label>
                  <select
                    id={`${tierKey}-template`}
                    className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                    value={competitionTierConfigs[tierKey].template}
                    onChange={(event) => updateTierConfig(tierKey, { template: event.target.value as (typeof TEMPLATE_OPTIONS)[number]['value'] })}
                  >
                    {TEMPLATE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <Label htmlFor={`${tierKey}-description`} className="text-xs">Description Template</Label>
                <Textarea
                  id={`${tierKey}-description`}
                  value={competitionTierConfigs[tierKey].descriptionTemplate}
                  onChange={(event) => updateTierConfig(tierKey, { descriptionTemplate: event.target.value })}
                  className="mt-1 min-h-[96px]"
                />
              </div>

              <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Preview</p>
                <div className="mt-2 text-sm text-gray-700 leading-relaxed">
                  <InlineMarkdown>{samplePreviewByTier[tierKey]}</InlineMarkdown>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}

        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={() => setStep('select')}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Button onClick={() => setStep('signatories')}>
            Next
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  function renderSignatoryStep() {
    if (loadingSignatories) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-gray-500">
          <Loader2 className="mb-3 h-8 w-8 animate-spin" />
          <p>Loading signatories...</p>
        </div>
      );
    }

    const activeSignatories = signatories.filter((signatory) => signatory.isActive);

    return (
      <motion.div
        key="signatories"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-6"
      >
        {mode === 'attendance' ? (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Certificate Options</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium">Certificate Type</p>
                <div className="flex flex-wrap gap-2">
                  {CERT_TYPE_OPTIONS.map((option) => (
                    <Button
                      key={option.value}
                      variant={attendanceCertType === option.value ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setAttendanceCertType(option.value)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <Label htmlFor="attendance-event-name" className="text-xs">Event Name (optional)</Label>
                <Input
                  id="attendance-event-name"
                  value={attendanceEventName}
                  onChange={(event) => setAttendanceEventName(event.target.value)}
                  placeholder={eventName}
                  className="mt-1"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Leave blank to use the event's actual name. Provide a custom name to override it on the generated certificates.
                </p>
              </div>

              <div>
                <Label htmlFor="attendance-template" className="text-xs">Template</Label>
                <select
                  id="attendance-template"
                  className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                  value={attendanceTemplate}
                  onChange={(event) => setAttendanceTemplate(event.target.value as CertificateTemplate)}
                >
                  {TEMPLATE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="attendance-position" className="text-xs">Position / Rank (optional)</Label>
                  <Input
                    id="attendance-position"
                    value={attendancePosition}
                    onChange={(event) => setAttendancePosition(event.target.value)}
                    placeholder="e.g. 1st Place"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="attendance-domain" className="text-xs">Domain / Track (optional)</Label>
                  <Input
                    id="attendance-domain"
                    value={attendanceDomain}
                    onChange={(event) => setAttendanceDomain(event.target.value)}
                    placeholder="e.g. Web Development"
                    className="mt-1"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="attendance-description" className="text-xs">Description (optional)</Label>
                <Textarea
                  id="attendance-description"
                  value={attendanceDescription}
                  onChange={(event) => setAttendanceDescription(event.target.value)}
                  className="mt-1 min-h-[96px]"
                  placeholder="Custom recognition text. Markdown supported: **bold**, *italic*, ***bold italic***"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Supports Markdown formatting like <code>**bold**</code>, <code>*italic*</code>, <code>***bold italic***</code>, and <code>~~strikethrough~~</code>.
                </p>
                {attendanceDescription.trim() && (
                  <div className="mt-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Preview</p>
                    <div className="mt-1 text-sm text-gray-700 leading-relaxed">
                      <InlineMarkdown>{attendanceDescription}</InlineMarkdown>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
              <p className="font-medium">{getStrategyLabel(competitionStrategy)}</p>
              <p className="mt-1">{competitionPreview.previewRows.length} certificates ready with the current tier settings.</p>
            </div>
            <div>
              <Label htmlFor="competition-domain" className="text-xs">Domain / Track (optional)</Label>
              <Input
                id="competition-domain"
                value={competitionDomain}
                onChange={(event) => setCompetitionDomain(event.target.value)}
                placeholder="Applied to all generated competition certificates"
                className="mt-1"
              />
            </div>
          </div>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Primary Signatory</p>
          <div className="mb-3 flex gap-2">
            <Button
              variant={!useCustomPrimary ? 'default' : 'outline'}
              size="sm"
              onClick={() => setUseCustomPrimary(false)}
            >
              Select Existing
            </Button>
            <Button
              variant={useCustomPrimary ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomPrimary(true);
                setPrimarySignatoryId(null);
              }}
            >
              Custom
            </Button>
          </div>

          {!useCustomPrimary ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeSignatories.length === 0 ? (
                <p className="col-span-2 text-sm text-gray-400">No active signatories found. Use a custom signatory instead.</p>
              ) : (
                activeSignatories.map((signatory) => (
                  <Card
                    key={signatory.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${
                      primarySignatoryId === signatory.id
                        ? 'border-blue-300 ring-2 ring-blue-500 dark:border-blue-700'
                        : 'border-gray-200 dark:border-gray-700'
                    }`}
                    onClick={() => setPrimarySignatoryId(signatory.id)}
                  >
                    <CardContent className="flex items-center gap-3 p-4">
                      {signatory.signatureUrl ? (
                        <img
                          src={signatory.signatureUrl}
                          alt={`${signatory.name} signature`}
                          className="h-10 w-16 rounded border bg-white object-contain dark:border-gray-600"
                        />
                      ) : (
                        <div className="flex h-10 w-16 items-center justify-center rounded border bg-gray-100 dark:border-gray-600 dark:bg-gray-800">
                          <span className="text-xs text-gray-400">No image</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{signatory.name}</p>
                        <p className="truncate text-xs text-gray-500">{signatory.title}</p>
                      </div>
                      {primarySignatoryId === signatory.id && (
                        <CheckCircle className="ml-auto h-5 w-5 shrink-0 text-blue-500" />
                      )}
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-4 dark:border-gray-700">
              <div>
                <Label htmlFor="custom-primary-name" className="text-xs">Name</Label>
                <Input
                  id="custom-primary-name"
                  value={customPrimary.name}
                  onChange={(event) => setCustomPrimary((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g., Dr. Sharma"
                />
              </div>
              <div>
                <Label htmlFor="custom-primary-title" className="text-xs">Title</Label>
                <Input
                  id="custom-primary-title"
                  value={customPrimary.title}
                  onChange={(event) => setCustomPrimary((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g., Club President"
                />
              </div>
              <div>
                <Label htmlFor="custom-primary-img" className="text-xs">Signature Image URL (optional)</Label>
                <Input
                  id="custom-primary-img"
                  value={customPrimary.imageUrl}
                  onChange={(event) => setCustomPrimary((current) => ({ ...current, imageUrl: event.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
        </div>

        <div>
          <p className="mb-2 text-sm font-medium">
            Faculty Signatory <span className="font-normal text-gray-400">(optional)</span>
          </p>
          <div className="mb-3 flex gap-2">
            <Button
              variant={!useCustomFaculty && !facultyExistingMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomFaculty(false);
                setFacultyExistingMode(false);
                setFacultySignatoryId(null);
                setCustomFaculty({ name: '', title: '', imageUrl: '' });
              }}
            >
              None
            </Button>
            <Button
              variant={!useCustomFaculty && facultyExistingMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomFaculty(false);
                setFacultyExistingMode(true);
              }}
              disabled={activeSignatories.length === 0}
            >
              Select Existing
            </Button>
            <Button
              variant={useCustomFaculty ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setUseCustomFaculty(true);
                setFacultyExistingMode(false);
                setFacultySignatoryId(null);
              }}
            >
              Custom
            </Button>
          </div>

          {!useCustomFaculty && !facultyExistingMode ? null : !useCustomFaculty ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {activeSignatories.map((signatory) => (
                <Card
                  key={signatory.id}
                  className={`cursor-pointer transition-all hover:shadow-md ${
                    facultySignatoryId === signatory.id
                      ? 'border-blue-300 ring-2 ring-blue-500 dark:border-blue-700'
                      : 'border-gray-200 dark:border-gray-700'
                  }`}
                  onClick={() => setFacultySignatoryId(signatory.id)}
                >
                  <CardContent className="flex items-center gap-3 p-4">
                    {signatory.signatureUrl ? (
                      <img
                        src={signatory.signatureUrl}
                        alt={`${signatory.name} signature`}
                        className="h-10 w-16 rounded border bg-white object-contain dark:border-gray-600"
                      />
                    ) : (
                      <div className="flex h-10 w-16 items-center justify-center rounded border bg-gray-100 dark:border-gray-600 dark:bg-gray-800">
                        <span className="text-xs text-gray-400">No image</span>
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{signatory.name}</p>
                      <p className="truncate text-xs text-gray-500">{signatory.title}</p>
                    </div>
                    {facultySignatoryId === signatory.id && (
                      <CheckCircle className="ml-auto h-5 w-5 shrink-0 text-blue-500" />
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-4 dark:border-gray-700">
              <div>
                <Label htmlFor="custom-faculty-name" className="text-xs">Name</Label>
                <Input
                  id="custom-faculty-name"
                  value={customFaculty.name}
                  onChange={(event) => setCustomFaculty((current) => ({ ...current, name: event.target.value }))}
                  placeholder="e.g., Prof. Gupta"
                />
              </div>
              <div>
                <Label htmlFor="custom-faculty-title" className="text-xs">Title</Label>
                <Input
                  id="custom-faculty-title"
                  value={customFaculty.title}
                  onChange={(event) => setCustomFaculty((current) => ({ ...current, title: event.target.value }))}
                  placeholder="e.g., Faculty Advisor"
                />
              </div>
              <div>
                <Label htmlFor="custom-faculty-img" className="text-xs">Signature Image URL (optional)</Label>
                <Input
                  id="custom-faculty-img"
                  value={customFaculty.imageUrl}
                  onChange={(event) => setCustomFaculty((current) => ({ ...current, imageUrl: event.target.value }))}
                  placeholder="https://..."
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          <Button
            variant="outline"
            onClick={() => setStep(mode === 'competition' ? 'config' : 'select')}
          >
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Button
            onClick={() => setStep('review')}
            disabled={
              (!useCustomPrimary && !primarySignatoryId)
              || (useCustomPrimary && !customPrimary.name)
            }
          >
            Next
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </motion.div>
    );
  }

  function renderReviewStep() {
    const primaryLabel = useCustomPrimary ? customPrimary.name : selectedPrimarySignatory?.name || 'Not selected';
    const primaryTitleLabel = useCustomPrimary ? customPrimary.title : selectedPrimarySignatory?.title || '';
    const facultyLabel = useCustomFaculty ? (customFaculty.name || 'Not set') : selectedFacultySignatory?.name || 'None';

    return (
      <motion.div
        key="review"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-5"
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="h-4 w-4" />
              Generation Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
              <span className="text-gray-500">Event</span>
              <span className="font-medium">
                {mode === 'attendance' && attendanceEventName.trim()
                  ? attendanceEventName.trim()
                  : eventName}
                {mode === 'attendance' && attendanceEventName.trim() && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    (overrides “{eventName}”)
                  </span>
                )}
              </span>

              <span className="text-gray-500">Recipients</span>
              <span className="font-medium">{currentRecipientCount}</span>

              {mode === 'attendance' ? (
                <>
                  <span className="text-gray-500">Certificate Type</span>
                  <Badge variant="outline" className="w-fit">{attendanceCertType}</Badge>

                  <span className="text-gray-500">Audience Mix</span>
                  <span className="font-medium">
                    {selectedIds.size} participant{selectedIds.size === 1 ? '' : 's'}
                    {' · '}
                    {selectedGuestIds.size} guest{selectedGuestIds.size === 1 ? '' : 's'}
                  </span>

                  <span className="text-gray-500">Template</span>
                  <span className="font-medium capitalize">{attendanceTemplate}</span>

                  {attendancePosition.trim() ? (
                    <>
                      <span className="text-gray-500">Position</span>
                      <span className="font-medium">{attendancePosition.trim()}</span>
                    </>
                  ) : null}

                  {attendanceDomain.trim() ? (
                    <>
                      <span className="text-gray-500">Domain</span>
                      <span className="font-medium">{attendanceDomain.trim()}</span>
                    </>
                  ) : null}

                  {attendanceDescription.trim() ? (
                    <>
                      <span className="text-gray-500">Description</span>
                      <span className="font-medium text-gray-700">
                        <InlineMarkdown>{attendanceDescription.trim()}</InlineMarkdown>
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                <>
                  <span className="text-gray-500">Strategy</span>
                  <span className="font-medium">{getStrategyLabel(competitionStrategy)}</span>

                  <span className="text-gray-500">Rounds</span>
                  <span className="font-medium">
                    {competitionRounds
                      .filter((round) => selectedRoundIds.includes(round.roundId))
                      .map((round) => round.title)
                      .join(', ')}
                  </span>

                  {competitionDomain.trim() ? (
                    <>
                      <span className="text-gray-500">Domain</span>
                      <span className="font-medium">{competitionDomain.trim()}</span>
                    </>
                  ) : null}
                </>
              )}

              <span className="text-gray-500">Primary Signatory</span>
              <span className="font-medium">
                {primaryLabel}
                {primaryTitleLabel ? <span className="font-normal text-gray-400"> - {primaryTitleLabel}</span> : null}
              </span>

              <span className="text-gray-500">Faculty Signatory</span>
              <span className="font-medium">{facultyLabel}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
              <div>
                <p className="font-medium text-gray-900">Send email notifications</p>
                <p className="text-sm text-gray-500">Toggle whether generated certificates should be emailed immediately.</p>
              </div>
              <Switch checked={sendEmail} onCheckedChange={setSendEmail} />
            </div>
          </CardContent>
        </Card>

        {mode === 'competition' && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Competition Recipient Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="overflow-hidden rounded-lg border dark:border-gray-700">
                <div className="max-h-80 overflow-x-auto overflow-y-auto">
                  <table className="min-w-[760px] w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="p-3 text-left">Recipient</th>
                        <th className="p-3 text-left">Team</th>
                        <th className="p-3 text-left">Rank</th>
                        <th className="p-3 text-left">Type</th>
                        <th className="p-3 text-left">Position</th>
                        <th className="p-3 text-left">Strategy Source</th>
                        <th className="p-3 text-left">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y dark:divide-gray-700">
                      {competitionPreview.previewRows.map((row) => (
                        <tr key={`${row.competitorKey}-${row.userId}`}>
                          <td className="p-3">
                            <p className="font-medium">{row.name}</p>
                            <p className="text-xs text-gray-500">{row.email}</p>
                          </td>
                          <td className="p-3">{row.teamName || '-'}</td>
                          <td className="p-3">#{row.rank}</td>
                          <td className="p-3">
                            <Badge variant="outline">{row.certType}</Badge>
                          </td>
                          <td className="p-3">{row.position || '-'}</td>
                          <td className="p-3">{row.strategySource}</td>
                          <td className="p-3 text-xs text-gray-600 leading-relaxed">
                            <InlineMarkdown>{row.description}</InlineMarkdown>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {mode === 'attendance' && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm dark:border-blue-800 dark:bg-blue-900/10">
            <div className="flex gap-2">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 dark:text-blue-400" />
              <div className="space-y-1 text-blue-800 dark:text-blue-300">
                <p className="font-medium">What will happen:</p>
                <ul className="list-disc list-inside space-y-0.5 text-blue-700 dark:text-blue-400">
                  <li>{selectedRecipientEmails.length} PDF certificate{selectedRecipientEmails.length !== 1 ? 's' : ''} will be generated.</li>
                  <li>{selectedGuestIds.size} guest certificate{selectedGuestIds.size === 1 ? '' : 's'} are included in this batch.</li>
                  <li>Each certificate will be uploaded to cloud storage.</li>
                  <li>
                    {sendEmail
                      ? 'Email notifications will be sent to all selected recipients.'
                      : 'Certificates will be stored without sending email notifications yet.'}
                  </li>
                  <li>Recipients who already have an attendance certificate for this event are skipped.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {currentRecipientCount > 20 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-800 dark:bg-amber-900/10">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
              <p className="text-amber-800 dark:text-amber-300">
                Generating {currentRecipientCount} certificates may take a few minutes. Please do not close this page during generation.
              </p>
            </div>
          </div>
        )}

        {generateError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm dark:border-red-800 dark:bg-red-900/10">
            <div className="flex gap-2">
              <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
              <p className="text-red-800 dark:text-red-300">{generateError}</p>
            </div>
          </div>
        )}

        <div className="flex items-center justify-between pt-2">
          <Button variant="outline" onClick={() => setStep('signatories')} disabled={generating}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Button onClick={() => setGenerateConfirmOpen(true)} disabled={generating || currentRecipientCount === 0}>
            {generating ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Award className="mr-1.5 h-4 w-4" />
                Generate Certificates
              </>
            )}
          </Button>
        </div>
      </motion.div>
    );
  }

  function renderManagement() {
    return (
      <motion.div
        key="manage"
        variants={stepVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.25 }}
        className="space-y-4"
      >
        {generationSummary && (
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-green-200 bg-green-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-green-700">Generated</p>
                  <p className="text-2xl font-bold text-green-800">{generationSummary.generated}</p>
                </div>
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-amber-700">Skipped / Failed</p>
                  <p className="text-2xl font-bold text-amber-800">{generationSummary.failed}</p>
                </div>
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                  <p className="text-xs uppercase tracking-wide text-blue-700">Emails Sent</p>
                  <p className="text-2xl font-bold text-blue-800">{generationSummary.emailsSent ?? 0}</p>
                </div>
              </div>
              {generationSummary.errors.length > 0 && (
                <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  <p className="font-medium">Skipped recipients</p>
                  <ul className="mt-2 space-y-1">
                    {generationSummary.errors.slice(0, 5).map((error) => (
                      <li key={`${error.email}-${error.reason}`}>{error.name} ({error.email}) — {error.reason}</li>
                    ))}
                    {generationSummary.errors.length > 5 && (
                      <li>...and {generationSummary.errors.length - 5} more</li>
                    )}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-lg font-semibold">Generated Certificates ({generatedCerts.length})</h3>
            <p className="text-sm text-gray-500">Manage the certificates generated for {eventName}</p>
          </div>
          <div className="flex gap-2">
            {managementSelected.size > 0 && (
              <div className="space-y-1 text-right">
                <Button variant="outline" size="sm" onClick={handleBulkResend} disabled={bulkResending}>
                  {bulkResending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mail className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {bulkResending
                    ? `Resending ${bulkResendProgress.completed}/${bulkResendProgress.total}`
                    : `Resend Selected (${managementSelected.size})`}
                </Button>
                {bulkResending && (
                  <p className="text-xs text-gray-500" aria-live="polite">
                    Processing {bulkResendProgress.completed} of {bulkResendProgress.total}
                    {bulkResendProgress.failed > 0 ? `, ${bulkResendProgress.failed} failed` : ''}
                  </p>
                )}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetForNewGeneration();
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Generate More
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search by name, email, or cert ID..."
            value={managementSearch}
            onChange={(event) => setManagementSearch(event.target.value)}
            className="pl-9"
          />
        </div>

        <div className="overflow-hidden rounded-lg border dark:border-gray-700">
          <div className="max-h-96 overflow-x-auto overflow-y-auto">
            <table className="min-w-[640px] w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="w-10 p-3 text-left">
                    <input
                      type="checkbox"
                      checked={filteredCerts.length > 0 && filteredCerts.every((certificate) => managementSelected.has(certificate.certId))}
                      onChange={() => {
                        const ids = filteredCerts.map((certificate) => certificate.certId);
                        const allSelected = ids.every((id) => managementSelected.has(id));
                        setManagementSelected((current) => {
                          const next = new Set(current);
                          for (const id of ids) {
                            if (allSelected) {
                              next.delete(id);
                            } else {
                              next.add(id);
                            }
                          }
                          return next;
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                  </th>
                  <th className="p-3 text-left">Recipient</th>
                  <th className="hidden p-3 text-left sm:table-cell">Cert ID</th>
                  <th className="hidden p-3 text-left md:table-cell">Email Status</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {filteredCerts.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-400">
                      No certificates found.
                    </td>
                  </tr>
                ) : (
                  filteredCerts.map((certificate) => (
                    <tr key={certificate.certId} className="transition-colors hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={managementSelected.has(certificate.certId)}
                          onChange={() => toggleManagementCert(certificate.certId)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="p-3">
                        <p className="truncate font-medium">{certificate.recipientName}</p>
                        <p className="truncate text-xs text-gray-500">{certificate.recipientEmail}</p>
                      </td>
                      <td className="hidden p-3 sm:table-cell">
                        <code className="rounded bg-gray-100 px-1.5 py-0.5 text-xs dark:bg-gray-800">{certificate.certId}</code>
                      </td>
                      <td className="hidden p-3 md:table-cell">
                        {certificate.emailSent ? (
                          <Badge variant="outline" className="border-green-300 text-green-700 dark:border-green-700 dark:text-green-400">
                            <Mail className="mr-1 h-3 w-3" />
                            Sent
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-gray-300 text-gray-500">Not Sent</Badge>
                        )}
                      </td>
                      <td className="p-3">
                        <div className="flex items-center justify-end gap-1">
                          {certificate.isRevoked && (
                            <Badge variant="outline" className="mr-1 border-red-300 text-red-600 dark:border-red-700 dark:text-red-400">
                              Revoked
                            </Badge>
                          )}
                          {certificate.pdfUrl && !certificate.isRevoked && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleDownload(certificate.certId)}
                              disabled={actionLoading[`dl-${certificate.certId}`]}
                              title="Download PDF"
                            >
                              {actionLoading[`dl-${certificate.certId}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0"
                            onClick={() => handleResendEmail(certificate.certId)}
                            disabled={actionLoading[`mail-${certificate.certId}`]}
                            title="Resend Email"
                          >
                            {actionLoading[`mail-${certificate.certId}`] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-amber-600 hover:text-amber-700"
                            onClick={() => setConfirmDialog({
                              open: true,
                              action: 'revoke',
                              certId: certificate.certId,
                              recipientName: certificate.recipientName,
                            })}
                            title="Revoke"
                          >
                            <XCircle className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700"
                            onClick={() => setConfirmDialog({
                              open: true,
                              action: 'delete',
                              certId: certificate.certId,
                              recipientName: certificate.recipientName,
                            })}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </motion.div>
    );
  }

  function renderConfirmDialog() {
    if (!confirmDialog) return null;

    const isRevoke = confirmDialog.action === 'revoke';
    const loading = actionLoading[`confirm-${confirmDialog.certId}`];

    return (
      <AlertDialog
        open={confirmDialog.open}
        onOpenChange={(open) => {
          if (!open && !loading) {
            setConfirmDialog(null);
          }
        }}
      >
        <ConfirmDialogContent className="max-w-sm">
          <ConfirmDialogHeader>
            <ConfirmDialogTitle className="flex items-center gap-2">
              {isRevoke ? (
                <XCircle className="h-5 w-5 text-amber-500" />
              ) : (
                <Trash2 className="h-5 w-5 text-red-500" />
              )}
              {isRevoke ? 'Revoke Certificate' : 'Delete Certificate'}
            </ConfirmDialogTitle>
          </ConfirmDialogHeader>
          <ConfirmDialogDescription>
            Are you sure you want to {isRevoke ? 'revoke' : 'permanently delete'} the certificate for{' '}
            <span className="font-medium text-gray-900 dark:text-white">{confirmDialog.recipientName}</span>?
            {!isRevoke && ' This action cannot be undone.'}
          </ConfirmDialogDescription>
          <ConfirmDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={isRevoke ? '' : 'bg-red-600 hover:bg-red-700'}
              onClick={handleConfirmAction}
              disabled={loading}
            >
              {loading ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {isRevoke ? 'Revoke' : 'Delete'}
            </AlertDialogAction>
          </ConfirmDialogFooter>
        </ConfirmDialogContent>
      </AlertDialog>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2">
          <Award className="h-5 w-5 text-amber-500" />
          Certificate Wizard
        </CardTitle>
        <p className="text-sm text-gray-500">{eventName}</p>
      </CardHeader>
      <CardContent>
        {step !== 'manage' && <StepIndicator />}
        <AnimatePresence mode="wait">
          {step === 'mode' && renderModeStep()}
          {step === 'select' && mode === 'attendance' && renderAttendanceSelection()}
          {step === 'select' && mode === 'competition' && renderCompetitionSelection()}
          {step === 'config' && mode === 'competition' && renderCompetitionConfiguration()}
          {step === 'signatories' && renderSignatoryStep()}
          {step === 'review' && renderReviewStep()}
          {step === 'manage' && renderManagement()}
        </AnimatePresence>

        {renderConfirmDialog()}

        <AlertDialog open={generateConfirmOpen} onOpenChange={setGenerateConfirmOpen}>
          <ConfirmDialogContent>
            <ConfirmDialogHeader>
              <ConfirmDialogTitle>Generate certificates?</ConfirmDialogTitle>
              <ConfirmDialogDescription>
                {mode === 'competition'
                  ? `This will generate ${competitionPreview.previewRows.length} certificate${competitionPreview.previewRows.length !== 1 ? 's' : ''}, upload the PDF files, and ${sendEmail ? 'email the selected recipients.' : 'store them without sending email notifications yet.'}`
                  : `This will generate ${selectedIds.size} certificate${selectedIds.size !== 1 ? 's' : ''}, upload the PDF files, and ${sendEmail ? 'email the selected recipients.' : 'store them without sending email notifications yet.'}`}
              </ConfirmDialogDescription>
            </ConfirmDialogHeader>
            <ConfirmDialogFooter>
              <AlertDialogCancel disabled={generating}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => void handleGenerate()} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  'Generate Certificates'
                )}
              </AlertDialogAction>
            </ConfirmDialogFooter>
          </ConfirmDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
