import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type AttendanceRecord } from '@/lib/api';
import { formatDateTime } from '@/lib/dateUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { motion } from 'framer-motion';
import {
  CheckCircle,
  XCircle,
  Search,
  Download,
  Mail,
  RefreshCw,
  Users,
  Loader2,
  Edit,
  QrCode,
  UserCheck,
  UserX,
} from 'lucide-react';

interface AttendanceManagerProps {
  eventId: string;
  token: string;
}

type FilterMode = 'all' | 'present' | 'absent';
type SortMode = 'name' | 'scanTime' | 'registrationTime';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error';
}

let toastIdCounter = 0;

export default function AttendanceManager({ eventId, token }: AttendanceManagerProps) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [sortMode, setSortMode] = useState<SortMode>('name');

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailSending, setEmailSending] = useState(false);
  const [emailResult, setEmailResult] = useState<string | null>(null);

  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState<AttendanceRecord | null>(null);
  const [editTimestamp, setEditTimestamp] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = ++toastIdCounter;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const data = await api.getAttendanceFull(eventId, token);
      setRecords(data.registrations);
    } catch (err) {
      showToast('Failed to load attendance data', 'error');
      throw err; // re-throw so callers know it failed
    }
  }, [eventId, token, showToast]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchData().catch(() => {}).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [fetchData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchData();
      showToast('Data refreshed', 'success');
    } catch {
      // fetchData already showed error toast
    } finally {
      setRefreshing(false);
    }
  };

  // --- Summary stats ---
  const summary = useMemo(() => {
    const total = records.length;
    const present = records.filter((r) => r.attended).length;
    const absent = total - present;
    const manualOverrides = records.filter((r) => r.manualOverride).length;
    const percentage = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, manualOverrides, percentage };
  }, [records]);

  // --- Filtering, searching, sorting ---
  const filteredRecords = useMemo(() => {
    let result = [...records];

    if (filterMode === 'present') {
      result = result.filter((r) => r.attended);
    } else if (filterMode === 'absent') {
      result = result.filter((r) => !r.attended);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (r) =>
          r.user.name.toLowerCase().includes(q) ||
          r.user.email.toLowerCase().includes(q)
      );
    }

    result.sort((a, b) => {
      if (sortMode === 'name') {
        return a.user.name.localeCompare(b.user.name);
      }
      if (sortMode === 'scanTime') {
        const aTime = a.scannedAt ? new Date(a.scannedAt).getTime() : 0;
        const bTime = b.scannedAt ? new Date(b.scannedAt).getTime() : 0;
        return bTime - aTime;
      }
      // registrationTime
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return result;
  }, [records, filterMode, searchQuery, sortMode]);

  // --- Selection ---
  const allFilteredSelected =
    filteredRecords.length > 0 &&
    filteredRecords.every((r) => selectedIds.has(r.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRecords.map((r) => r.id)));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // --- Single actions ---
  const handleManualCheckin = async (registrationId: string) => {
    setActionLoadingId(registrationId);
    try {
      await api.manualCheckin(registrationId, token);
      showToast('Marked as present', 'success');
      await fetchData();
    } catch {
      showToast('Failed to mark attendance', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleUnmark = async (registrationId: string) => {
    setActionLoadingId(registrationId);
    try {
      await api.unmarkAttendance(registrationId, token);
      showToast('Attendance unmarked', 'success');
      await fetchData();
    } catch {
      showToast('Failed to unmark attendance', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRegenerateToken = async (registrationId: string) => {
    setActionLoadingId(registrationId);
    try {
      await api.regenerateAttendanceToken(registrationId, token);
      showToast('QR token regenerated', 'success');
      await fetchData();
    } catch {
      showToast('Failed to regenerate token', 'error');
    } finally {
      setActionLoadingId(null);
    }
  };

  // --- Edit timestamp ---
  const openEditDialog = (record: AttendanceRecord) => {
    setEditingRecord(record);
    if (record.scannedAt) {
      const date = new Date(record.scannedAt);
      const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setEditTimestamp(local);
    } else {
      setEditTimestamp('');
    }
    setEditDialogOpen(true);
  };

  const handleEditSave = async () => {
    if (!editingRecord) return;
    setEditSaving(true);
    try {
      await api.editAttendance(
        editingRecord.id,
        { scannedAt: editTimestamp || undefined, manualOverride: true },
        token
      );
      showToast('Timestamp updated', 'success');
      setEditDialogOpen(false);
      setEditingRecord(null);
      await fetchData();
    } catch {
      showToast('Failed to update timestamp', 'error');
    } finally {
      setEditSaving(false);
    }
  };

  // --- Bulk actions ---
  const handleBulkAction = async (action: 'mark' | 'unmark') => {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const result = await api.bulkUpdateAttendance(
        Array.from(selectedIds),
        action,
        token
      );
      showToast(
        `${result.updated} record${result.updated !== 1 ? 's' : ''} updated`,
        'success'
      );
      setSelectedIds(new Set());
      await fetchData();
    } catch {
      showToast('Bulk update failed', 'error');
    } finally {
      setBulkLoading(false);
    }
  };

  // --- Export ---
  const handleExport = async () => {
    try {
      const blob = await api.exportAttendanceExcel(eventId, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-${eventId}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast('Export downloaded', 'success');
    } catch {
      showToast('Export failed', 'error');
    }
  };

  // --- Email absentees ---
  const openEmailDialog = () => {
    setEmailSubject('You missed an event');
    setEmailBody(
      'Hi,\n\nWe noticed you were registered for the event but could not attend. We hope to see you at the next one!\n\nBest regards,\ncode.scriet Team'
    );
    setEmailResult(null);
    setEmailDialogOpen(true);
  };

  const handleSendEmail = async () => {
    setEmailSending(true);
    try {
      const result = await api.emailAbsentees(eventId, emailSubject, emailBody, token);
      setEmailResult(`Emailed ${result.emailed} absentee${result.emailed !== 1 ? 's' : ''}`);
      showToast(`Emailed ${result.emailed} absentees`, 'success');
    } catch {
      showToast('Failed to send emails', 'error');
    } finally {
      setEmailSending(false);
    }
  };

  // --- Avatar helper ---
  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  // --- Loading state ---
  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading attendance data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast notifications */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 40 }}
            className={`rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
              toast.type === 'success'
                ? 'bg-green-600 text-white'
                : 'bg-red-600 text-white'
            }`}
          >
            {toast.message}
          </motion.div>
        ))}
      </div>

      {/* Summary Bar */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Registered
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-500" />
              <span className="text-2xl font-bold">{summary.total}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Present
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="text-2xl font-bold">{summary.present}</span>
              <span className="text-sm text-muted-foreground">
                ({summary.percentage}%)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Absent
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-500" />
              <span className="text-2xl font-bold">{summary.absent}</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Manual Overrides
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <Edit className="h-5 w-5 text-orange-500" />
              <span className="text-2xl font-bold">{summary.manualOverrides}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={filterMode === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMode('all')}
          >
            All
          </Button>
          <Button
            variant={filterMode === 'present' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMode('present')}
          >
            Present
          </Button>
          <Button
            variant={filterMode === 'absent' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterMode('absent')}
          >
            Absent
          </Button>

          <span className="mx-1 hidden text-muted-foreground sm:inline">|</span>

          <select
            value={sortMode}
            onChange={(e) => setSortMode(e.target.value as SortMode)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="name">Sort: Name</option>
            <option value="scanTime">Sort: Scan Time</option>
            <option value="registrationTime">Sort: Registration</option>
          </select>
        </div>
      </div>

      {/* Action buttons row */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
        <Button variant="outline" size="sm" onClick={handleExport}>
          <Download className="mr-2 h-4 w-4" />
          Export Excel
        </Button>
        <Button variant="outline" size="sm" onClick={openEmailDialog}>
          <Mail className="mr-2 h-4 w-4" />
          Email Absentees
        </Button>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 dark:border-blue-800 dark:bg-blue-950"
        >
          <span className="text-sm font-medium">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            variant="default"
            onClick={() => handleBulkAction('mark')}
            disabled={bulkLoading}
          >
            {bulkLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserCheck className="mr-2 h-4 w-4" />
            )}
            Mark Present
          </Button>
          <Button
            size="sm"
            variant="destructive"
            onClick={() => handleBulkAction('unmark')}
            disabled={bulkLoading}
          >
            {bulkLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <UserX className="mr-2 h-4 w-4" />
            )}
            Mark Absent
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setSelectedIds(new Set())}
          >
            Clear
          </Button>
        </motion.div>
      )}

      {/* Data Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="w-10 px-4 py-3 text-left">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300"
                    />
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Student
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground md:table-cell">
                    Email
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground lg:table-cell">
                    Branch / Year
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Status
                  </th>
                  <th className="hidden px-4 py-3 text-left font-medium text-muted-foreground sm:table-cell">
                    Scanned At
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                      {searchQuery || filterMode !== 'all'
                        ? 'No records match your search or filter.'
                        : 'No registrations found for this event.'}
                    </td>
                  </tr>
                ) : (
                  filteredRecords.map((record) => {
                    const isLoading = actionLoadingId === record.id;
                    return (
                      <tr
                        key={record.id}
                        className={`border-b transition-colors hover:bg-muted/30 ${
                          selectedIds.has(record.id) ? 'bg-blue-50/50 dark:bg-blue-950/30' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(record.id)}
                            onChange={() => toggleSelect(record.id)}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </td>

                        {/* Avatar + Name */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {record.user.avatar ? (
                              <img
                                src={record.user.avatar}
                                alt={record.user.name}
                                className="h-8 w-8 rounded-full object-cover"
                              />
                            ) : (
                              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
                                {getInitials(record.user.name)}
                              </div>
                            )}
                            <div>
                              <div className="font-medium">{record.user.name}</div>
                              <div className="text-xs text-muted-foreground md:hidden">
                                {record.user.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Email */}
                        <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                          {record.user.email}
                        </td>

                        {/* Branch / Year */}
                        <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                          {[record.user.branch, record.user.year]
                            .filter(Boolean)
                            .join(' - ') || '-'}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            {record.attended ? (
                              <Badge className="bg-green-100 text-green-700 hover:bg-green-100 dark:bg-green-900/40 dark:text-green-400">
                                Present
                              </Badge>
                            ) : (
                              <Badge variant="destructive" className="bg-red-100 text-red-700 hover:bg-red-100 dark:bg-red-900/40 dark:text-red-400">
                                Absent
                              </Badge>
                            )}
                            {record.manualOverride && (
                              <Badge variant="outline" className="text-xs text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700">
                                Manual
                              </Badge>
                            )}
                          </div>
                        </td>

                        {/* Scanned At */}
                        <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                          {record.scannedAt ? formatDateTime(record.scannedAt) : '-'}
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {record.attended ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleUnmark(record.id)}
                                disabled={isLoading}
                                title="Unmark attendance"
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950"
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserX className="h-4 w-4" />
                                )}
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleManualCheckin(record.id)}
                                disabled={isLoading}
                                title="Mark as present"
                                className="text-green-600 hover:text-green-700 hover:bg-green-50 dark:hover:bg-green-950"
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                              </Button>
                            )}

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openEditDialog(record)}
                              disabled={isLoading}
                              title="Edit timestamp"
                            >
                              <Edit className="h-4 w-4" />
                            </Button>

                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRegenerateToken(record.id)}
                              disabled={isLoading}
                              title="Regenerate QR token"
                            >
                              <QrCode className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Showing count */}
      <p className="text-sm text-muted-foreground">
        Showing {filteredRecords.length} of {records.length} registrations
      </p>

      {/* Edit Timestamp Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Scan Timestamp</DialogTitle>
          </DialogHeader>
          {editingRecord && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Editing timestamp for{' '}
                <span className="font-medium text-foreground">
                  {editingRecord.user.name}
                </span>
              </p>
              <div className="space-y-2">
                <Label htmlFor="edit-timestamp">Scanned At</Label>
                <Input
                  id="edit-timestamp"
                  type="datetime-local"
                  value={editTimestamp}
                  onChange={(e) => setEditTimestamp(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditDialogOpen(false)}
              disabled={editSaving}
            >
              Cancel
            </Button>
            <Button onClick={handleEditSave} disabled={editSaving}>
              {editSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Absentees Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Email Absentees</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {emailResult ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-center text-sm font-medium text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400">
                {emailResult}
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  This will send an email to all {summary.absent} absent registrant
                  {summary.absent !== 1 ? 's' : ''}.
                </p>
                <div className="space-y-2">
                  <Label htmlFor="email-subject">Subject</Label>
                  <Input
                    id="email-subject"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder="Email subject"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-body">Body</Label>
                  <Textarea
                    id="email-body"
                    value={emailBody}
                    onChange={(e) => setEmailBody(e.target.value)}
                    placeholder="Email body"
                    rows={6}
                  />
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEmailDialogOpen(false)}
            >
              {emailResult ? 'Close' : 'Cancel'}
            </Button>
            {!emailResult && (
              <Button
                onClick={handleSendEmail}
                disabled={emailSending || !emailSubject.trim() || !emailBody.trim()}
              >
                {emailSending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Send to {summary.absent} absentee{summary.absent !== 1 ? 's' : ''}
                  </>
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
