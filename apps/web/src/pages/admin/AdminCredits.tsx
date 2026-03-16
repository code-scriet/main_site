import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Award, Loader2, AlertCircle, Plus, Trash2, Edit2, X, Check } from 'lucide-react';
import { api, type Credit, type TeamMember } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const CATEGORY_PRESETS = [
  'Founding',
  'Platform',
  'Design',
  'Events',
  'Content',
  'Infrastructure',
  'Special Thanks',
];

export default function AdminCredits() {
  const { token } = useAuth();
  const [credits, setCredits] = useState<Credit[]>([]);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memberFilter, setMemberFilter] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'Founding',
    customCategory: '',
    teamMemberId: '',
    order: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [creditsData, membersData] = await Promise.all([
        api.getCredits(),
        api.getTeam(),
      ]);
      setCredits(creditsData);
      setTeamMembers(membersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setForm({ title: '', description: '', category: 'Founding', customCategory: '', teamMemberId: '', order: 0 });
    setEditingId(null);
    setShowForm(false);
    setMemberFilter('');
  };

  const handleEdit = (credit: Credit) => {
    const isPreset = CATEGORY_PRESETS.includes(credit.category);
    setForm({
      title: credit.title,
      description: credit.description || '',
      category: isPreset ? credit.category : 'custom',
      customCategory: isPreset ? '' : credit.category,
      teamMemberId: credit.teamMemberId || '',
      order: credit.order,
    });
    setEditingId(credit.id);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    const category = form.category === 'custom' ? form.customCategory.trim() : form.category;
    if (!category) {
      setError('Category is required');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        title: form.title,
        description: form.description || undefined,
        category,
        teamMemberId: form.teamMemberId || undefined,
        order: form.order,
      };

      if (editingId) {
        await api.updateCredit(editingId, payload, token);
        setSuccess('Credit updated successfully');
      } else {
        await api.createCredit(payload, token);
        setSuccess('Credit created successfully');
      }
      resetForm();
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save credit');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!token || !window.confirm('Are you sure you want to delete this credit?')) return;
    try {
      await api.deleteCredit(id, token);
      setSuccess('Credit deleted');
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete credit');
    }
  };

  const filteredMembers = teamMembers.filter(
    (m) =>
      !memberFilter ||
      m.name.toLowerCase().includes(memberFilter.toLowerCase()) ||
      m.role.toLowerCase().includes(memberFilter.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credits Management</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage credits and acknowledgements displayed on the public credits page.
          </p>
        </div>
        <Button onClick={() => { resetForm(); setShowForm(true); }} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Credit
        </Button>
      </div>

      {error && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </motion.div>
      )}
      {success && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <Check className="h-4 w-4 shrink-0" />
          {success}
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="h-4 w-4" /></button>
        </motion.div>
      )}

      {/* Form */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit Credit' : 'Add New Credit'}</CardTitle>
            <CardDescription>
              {editingId ? 'Update this credit entry.' : 'Add a new credit to acknowledge a contribution.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <Input
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g., Founded code.scriet"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <Textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="A brief description of the contribution..."
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {CATEGORY_PRESETS.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setForm({ ...form, category: cat, customCategory: '' })}
                      className={`rounded-full border px-3 py-1 text-sm transition ${
                        form.category === cat
                          ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, category: 'custom' })}
                    className={`rounded-full border px-3 py-1 text-sm transition ${
                      form.category === 'custom'
                        ? 'border-amber-500 bg-amber-50 text-amber-700 font-medium'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    Custom...
                  </button>
                </div>
                {form.category === 'custom' && (
                  <Input
                    value={form.customCategory}
                    onChange={(e) => setForm({ ...form, customCategory: e.target.value })}
                    placeholder="Enter custom category"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Linked Team Member</label>
                <Input
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  placeholder="Search team members..."
                  className="mb-2"
                />
                <select
                  value={form.teamMemberId}
                  onChange={(e) => setForm({ ...form, teamMemberId: e.target.value })}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
                >
                  <option value="">No team member linked</option>
                  {filteredMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} — {m.role} ({m.team})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-400">
                  Link this credit to a team member to show their avatar and link to their profile.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
                <Input
                  type="number"
                  value={form.order}
                  onChange={(e) => setForm({ ...form, order: parseInt(e.target.value) || 0 })}
                  min={0}
                  max={10000}
                />
                <p className="mt-1 text-xs text-gray-400">Lower numbers appear first within a category.</p>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="submit" disabled={saving} className="gap-2">
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  {editingId ? 'Update Credit' : 'Create Credit'}
                </Button>
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Credits List */}
      {credits.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Award className="h-10 w-10 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No credits yet. Add one to get started.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {credits.map((credit) => (
            <Card key={credit.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4 min-w-0">
                  {credit.teamMember ? (
                    <img
                      src={credit.teamMember.imageUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${credit.teamMember.name}`}
                      alt={credit.teamMember.name}
                      className="h-10 w-10 rounded-full object-cover border"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
                      <Award className="h-5 w-5 text-amber-600" />
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900 truncate">{credit.title}</span>
                      <Badge variant="outline" className="text-xs shrink-0">
                        {credit.category}
                      </Badge>
                    </div>
                    {credit.teamMember && (
                      <p className="text-sm text-gray-500 truncate">
                        {credit.teamMember.name} &middot; {credit.teamMember.role}
                      </p>
                    )}
                    {credit.description && (
                      <p className="text-sm text-gray-400 truncate max-w-md">{credit.description}</p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <span className="text-xs text-gray-400">#{credit.order}</span>
                  <Button variant="ghost" size="sm" onClick={() => handleEdit(credit)}>
                    <Edit2 className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(credit.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
