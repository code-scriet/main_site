import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/context/AuthContext';
import { 
  Users, 
  Loader2, 
  AlertCircle, 
  Search,
  Clock,
  CheckCircle2,
  XCircle,
  Calendar,
  Palette,
  Megaphone,
  Trophy,
  Briefcase,
  ChevronDown,
  Mail,
  Phone,
  GraduationCap,
  Sparkles,
  Eye,
  Download
} from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

interface HiringApplication {
  id: string;
  name: string;
  email: string;
  phone?: string;
  department: string;
  year: string;
  skills?: string;
  applyingRole: string;
  status: string;
  userId?: string;
  createdAt: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

interface HiringStats {
  total: number;
  byStatus: Record<string, number>;
  byRole: Record<string, number>;
}

const roleConfig = {
  TECHNICAL: {
    label: 'Technical',
    icon: Users,
    color: 'bg-blue-100 text-blue-700 border-blue-200',
  },
  DESIGNING: {
    label: 'Designing',
    icon: Palette,
    color: 'bg-purple-100 text-purple-700 border-purple-200',
  },
  SOCIAL_MEDIA: {
    label: 'Social Media',
    icon: Megaphone,
    color: 'bg-rose-100 text-rose-700 border-rose-200',
  },
  DSA_CHAMPS: {
    label: 'DSA Champs',
    icon: Trophy,
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  },
  MANAGEMENT: {
    label: 'Management',
    icon: Briefcase,
    color: 'bg-amber-100 text-amber-700 border-amber-200',
  },
};

const roleFilterTabs = [
  { value: '', label: 'All' },
  { value: 'TECHNICAL', label: 'Technical' },
  { value: 'DSA_CHAMPS', label: 'DSA Champs' },
  { value: 'SOCIAL_MEDIA', label: 'Social Media' },
  { value: 'DESIGNING', label: 'Designing' },
  { value: 'MANAGEMENT', label: 'Management' },
];

const statusConfig = {
  PENDING: {
    label: 'Pending',
    icon: Clock,
    color: 'bg-gray-100 text-gray-700',
  },
  INTERVIEW_SCHEDULED: {
    label: 'Interview Scheduled',
    icon: Calendar,
    color: 'bg-blue-100 text-blue-700',
  },
  SELECTED: {
    label: 'Selected',
    icon: CheckCircle2,
    color: 'bg-green-100 text-green-700',
  },
  REJECTED: {
    label: 'Rejected',
    icon: XCircle,
    color: 'bg-red-100 text-red-700',
  },
};

export default function AdminHiring() {
  const { token } = useAuth();
  const [applications, setApplications] = useState<HiringApplication[]>([]);
  const [stats, setStats] = useState<HiringStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [selectedApplication, setSelectedApplication] = useState<HiringApplication | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    loadData();
  }, [statusFilter, roleFilter]);

  const loadData = async () => {
    if (!token) {
      setError('Authentication required');
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (roleFilter) params.append('role', roleFilter);

      const [applicationsRes, statsRes] = await Promise.all([
        fetch(`${API_URL}/hiring/applications?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_URL}/hiring/stats`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      if (!applicationsRes.ok || !statsRes.ok) {
        throw new Error('Failed to fetch data');
      }

      const applicationsData = await applicationsRes.json();
      const statsData = await statsRes.json();

      setApplications(applicationsData.data || []);
      setStats(statsData.data || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusUpdate = async (applicationId: string, newStatus: string) => {
    if (!token) return;
    
    try {
      setUpdatingId(applicationId);
      const response = await fetch(`${API_URL}/hiring/applications/${applicationId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (applicationId: string) => {
    if (!token || !confirm('Are you sure you want to delete this application?')) return;
    
    try {
      setUpdatingId(applicationId);
      const response = await fetch(`${API_URL}/hiring/applications/${applicationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to delete application');
      }

      await loadData();
      setSelectedApplication(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete application');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDownloadExcel = async () => {
    if (!token) return;
    
    try {
      setDownloading(true);
      const params = new URLSearchParams();
      if (statusFilter) params.append('status', statusFilter);
      if (roleFilter) params.append('role', roleFilter);

      const response = await fetch(`${API_URL}/hiring/export?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error('Failed to download Excel file');
      }

      // Get filename from Content-Disposition header or create default
      const contentDisposition = response.headers.get('Content-Disposition');
      let filename = 'hiring_applications.xlsx';
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to download Excel file');
    } finally {
      setDownloading(false);
    }
  };

  const filteredApplications = applications.filter(app => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      app.name.toLowerCase().includes(query) ||
      app.email.toLowerCase().includes(query) ||
      app.department.toLowerCase().includes(query)
    );
  });

  if (loading && applications.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Hiring Applications</h1>
        <p className="text-gray-600">Review and manage team applications</p>
      </div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700"
        >
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <p className="text-sm">{error}</p>
        </motion.div>
      )}

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-amber-500 p-3 rounded-lg">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{stats.total}</p>
                <p className="text-xs text-gray-500">Total</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-gray-500 p-3 rounded-lg">
                <Clock className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{stats.byStatus.PENDING || 0}</p>
                <p className="text-xs text-gray-500">Pending</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-blue-500 p-3 rounded-lg">
                <Calendar className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{stats.byStatus.INTERVIEW_SCHEDULED || 0}</p>
                <p className="text-xs text-gray-500">Scheduled</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="bg-green-500 p-3 rounded-lg">
                <CheckCircle2 className="h-5 w-5 text-white" />
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{stats.byStatus.SELECTED || 0}</p>
                <p className="text-xs text-gray-500">Selected</p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, or department..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-2">
              <div className="relative">
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-10 pl-3 pr-8 rounded-md border border-gray-300 bg-white text-sm appearance-none"
                >
                  <option value="">All Statuses</option>
                  <option value="PENDING">Pending</option>
                  <option value="INTERVIEW_SCHEDULED">Scheduled</option>
                  <option value="SELECTED">Selected</option>
                  <option value="REJECTED">Rejected</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
              <div className="relative">
                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="h-10 pl-3 pr-8 rounded-md border border-gray-300 bg-white text-sm appearance-none"
                >
                  <option value="">All Roles</option>
                  <option value="TECHNICAL">Technical</option>
                  <option value="DSA_CHAMPS">DSA Champs</option>
                  <option value="DESIGNING">Designing</option>
                  <option value="SOCIAL_MEDIA">Social Media</option>
                  <option value="MANAGEMENT">Management</option>
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
              </div>
              <Button
                onClick={handleDownloadExcel}
                disabled={downloading || filteredApplications.length === 0}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {roleFilterTabs.map((tab) => (
              <Button
                key={tab.label}
                type="button"
                variant={roleFilter === tab.value ? 'default' : 'outline'}
                className={roleFilter === tab.value ? 'bg-amber-600 hover:bg-amber-700 text-white' : ''}
                onClick={() => setRoleFilter(tab.value)}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Applications List */}
      <div className="grid gap-4">
        {filteredApplications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <Users className="h-12 w-12 mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">No applications found</p>
            </CardContent>
          </Card>
        ) : (
          filteredApplications.map((app) => {
            const role = roleConfig[app.applyingRole as keyof typeof roleConfig];
            const status = statusConfig[app.status as keyof typeof statusConfig];
            const RoleIcon = role?.icon || Users;
            const StatusIcon = status?.icon || Clock;

            return (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Card className="hover:shadow-md transition-shadow">
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      {/* Avatar & Name */}
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className={`p-3 rounded-lg ${role?.color || 'bg-gray-100'}`}>
                          <RoleIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <h3 className="font-semibold text-gray-900 truncate">{app.name}</h3>
                          <p className="text-sm text-gray-500 truncate">{app.email}</p>
                        </div>
                      </div>

                      {/* Info */}
                      <div className="flex flex-wrap gap-2 sm:gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <GraduationCap className="h-4 w-4" />
                          {app.department}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {app.year}
                        </span>
                      </div>

                      {/* Badges */}
                      <div className="flex items-center gap-2">
                        <Badge className={role?.color || ''}>
                          {role?.label || app.applyingRole}
                        </Badge>
                        <Badge className={status?.color || ''}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {status?.label || app.status}
                        </Badge>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSelectedApplication(app)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <div className="relative">
                          <select
                            value={app.status}
                            onChange={(e) => handleStatusUpdate(app.id, e.target.value)}
                            disabled={updatingId === app.id}
                            className="h-8 pl-2 pr-6 text-xs rounded border border-gray-300 bg-white appearance-none"
                          >
                            <option value="PENDING">Pending</option>
                            <option value="INTERVIEW_SCHEDULED">Schedule Interview</option>
                            <option value="SELECTED">Select</option>
                            <option value="REJECTED">Reject</option>
                          </select>
                          <ChevronDown className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 text-gray-400 pointer-events-none" />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })
        )}
      </div>

      {/* Detail Modal */}
      {selectedApplication && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto"
          >
            <div className="p-6">
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedApplication.name}</h2>
                  <p className="text-gray-500">{selectedApplication.email}</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedApplication(null)}
                >
                  ✕
                </Button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-gray-500">Phone</label>
                    <p className="font-medium">{selectedApplication.phone || 'Not provided'}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Department</label>
                    <p className="font-medium">{selectedApplication.department}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Year</label>
                    <p className="font-medium">{selectedApplication.year}</p>
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Applied For</label>
                    <p className="font-medium">
                      {roleConfig[selectedApplication.applyingRole as keyof typeof roleConfig]?.label || selectedApplication.applyingRole}
                    </p>
                  </div>
                </div>

                {selectedApplication.skills && (
                  <div>
                    <label className="text-xs text-gray-500">Skills</label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {selectedApplication.skills.split(',').map((skill, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          <Sparkles className="h-3 w-3 mr-1" />
                          {skill.trim()}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="text-xs text-gray-500">Status</label>
                  <div className="mt-1">
                    <Badge className={statusConfig[selectedApplication.status as keyof typeof statusConfig]?.color || ''}>
                      {statusConfig[selectedApplication.status as keyof typeof statusConfig]?.label || selectedApplication.status}
                    </Badge>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-gray-500">Applied On</label>
                  <p className="font-medium">
                    {formatDate(selectedApplication.createdAt)}
                  </p>
                </div>
              </div>

              <div className="flex gap-3 mt-6 pt-6 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => window.open(`mailto:${selectedApplication.email}`, '_blank')}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                {selectedApplication.phone && (
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => window.open(`tel:${selectedApplication.phone}`, '_blank')}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </Button>
                )}
              </div>

              <div className="flex gap-3 mt-3">
                <Button
                  variant="destructive"
                  className="flex-1"
                  onClick={() => handleDelete(selectedApplication.id)}
                  disabled={updatingId === selectedApplication.id}
                >
                  {updatingId === selectedApplication.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Delete Application'
                  )}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
