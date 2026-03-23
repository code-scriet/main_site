import { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { api, type NetworkProfile, type NetworkProfileInput } from '@/lib/api';
import {
  ArrowLeft,
  Save,
  Loader2,
  Eye,
  Target,
  BookOpen,
  Lightbulb,
  Award,
  Globe,
  Github,
  Linkedin,
  Twitter,
  Building2,
  Briefcase,
  MapPin,
  GraduationCap,
  Wrench,
  Shield,
  User,
  Handshake,
  Sparkles,
} from 'lucide-react';

export default function EditNetworkProfile() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, token } = useAuth();

  const [profile, setProfile] = useState<NetworkProfile | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    fullName: '',
    designation: '',
    company: '',
    industry: '',
    bio: '',
    vision: '',
    story: '',
    expertise: '',
    achievements: '',
    connectionNote: '',
    currentLocation: '',
    passoutYear: '',
    degree: '',
    branch: '',
    linkedinUsername: '',
    twitterUsername: '',
    githubUsername: '',
    personalWebsite: '',
  });

  const isAdmin = user && ['ADMIN', 'PRESIDENT'].includes(user.role);

  const populateForm = (data: NetworkProfile) => {
    setProfile(data);
    setForm({
      fullName: data.fullName || '',
      designation: data.designation || '',
      company: data.company || '',
      industry: data.industry || '',
      bio: data.bio || '',
      vision: data.vision || '',
      story: data.story || '',
      expertise: data.expertise || '',
      achievements: data.achievements || '',
      connectionNote: data.connectionNote || '',
      currentLocation: data.currentLocation || '',
      passoutYear: data.passoutYear ? String(data.passoutYear) : '',
      degree: data.degree || '',
      branch: data.branch || '',
      linkedinUsername: data.linkedinUsername || '',
      twitterUsername: data.twitterUsername || '',
      githubUsername: data.githubUsername || '',
      personalWebsite: data.personalWebsite || '',
    });
  };

  useEffect(() => {
    if (!token || !user) return;

    const fetchProfile = async () => {
      try {
        setLoading(true);

        // Strategy 1: If we have a slug/id param, fetch that profile (admin editing someone else's)
        if (id) {
          const data = await api.getNetworkProfile(id);
          if (data.id) {
            populateForm(data);
            setIsOwner(data.userId === user.id);
            return;
          }
        }

        // Strategy 2: Fetch my own profile
        const result = await api.getMyNetworkProfile(token);
        const data = result?.data || null;

        if (data) {
          populateForm(data);
          setIsOwner(true);
          return;
        }

        // No profile found at all
        if (!isAdmin) {
          navigate('/network/onboarding');
        } else {
          setError('Could not find the network profile to edit.');
        }
      } catch {
        setError('Failed to load the network profile.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, id, user?.id]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !profile) return;

    try {
      setSaving(true);
      setError(null);

      const payload: Partial<NetworkProfileInput> = {
        fullName: form.fullName,
        designation: form.designation,
        company: form.company,
        industry: form.industry,
        bio: form.bio,
        vision: form.vision,
        story: form.story,
        expertise: form.expertise,
        achievements: form.achievements,
        connectionNote: form.connectionNote,
        currentLocation: form.currentLocation,
        degree: form.degree,
        branch: form.branch,
        linkedinUsername: form.linkedinUsername,
        twitterUsername: form.twitterUsername,
        githubUsername: form.githubUsername,
        personalWebsite: form.personalWebsite,
      };
      if (form.passoutYear) {
        const parsedPassoutYear = parseInt(form.passoutYear, 10);
        if (Number.isFinite(parsedPassoutYear)) {
          payload.passoutYear = parsedPassoutYear;
        }
      }
      for (const key of Object.keys(payload)) {
        const value = payload[key as keyof NetworkProfileInput];
        if (value === '') {
          delete payload[key as keyof NetworkProfileInput];
        }
      }

      // Use admin endpoint if admin editing someone else's profile, owner endpoint otherwise
      if (isOwner) {
        await api.updateNetworkProfile(payload, token);
      } else if (isAdmin && profile.id) {
        await api.updateNetworkProfileAdmin(profile.id, payload, token);
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <p className="text-red-600">{error}</p>
        <Button variant="outline" onClick={() => navigate('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  const isAlumni = profile.connectionType === 'ALUMNI';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/dashboard" className="hover:text-amber-600 transition-colors">Dashboard</Link>
            <span>›</span>
            <span className="text-amber-600 font-medium">Edit Network Profile</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            Edit Profile
            <Badge variant="secondary" className="text-xs">{profile.fullName}</Badge>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Update the network profile visible to visitors</p>
        </div>
        <div className="flex items-center gap-2">
          {profile.slug && (
            <Link to={`/network/${profile.slug}`} target="_blank">
              <Button variant="outline" size="sm" className="gap-2">
                <Eye className="h-4 w-4" />
                View Page
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Permission Indicator */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-3 p-3 rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 flex-shrink-0">
          {isAdmin && !isOwner ? <Shield className="h-5 w-5 text-amber-600" /> : <User className="h-5 w-5 text-amber-600" />}
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">
            {isAdmin && !isOwner ? 'Admin Access' : 'Profile Owner'}
          </p>
          <p className="text-xs text-amber-700/70">
            {isAdmin && !isOwner ? 'You are editing this profile as an administrator.' : 'You are editing your own network profile.'}
          </p>
        </div>
      </motion.div>

      {/* Status Messages */}
      {success && (
        <div className="p-3 rounded-lg bg-green-100 border border-green-200 text-green-700 text-sm">
          {success}
        </div>
      )}
      {error && profile && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Professional Info */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800">
                <Briefcase className="h-4 w-4 text-white" />
              </span>
              Professional Info
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600">Full Name</label>
                <Input
                  value={form.fullName}
                  onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                  placeholder="Your full name"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600">Designation</label>
                <Input
                  value={form.designation}
                  onChange={(e) => setForm({ ...form, designation: e.target.value })}
                  placeholder="e.g. Senior Engineer"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Building2 className="h-4 w-4" /> Company
                </label>
                <Input
                  value={form.company}
                  onChange={(e) => setForm({ ...form, company: e.target.value })}
                  placeholder="Your company"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600">Industry</label>
                <Input
                  value={form.industry}
                  onChange={(e) => setForm({ ...form, industry: e.target.value })}
                  placeholder="e.g. FinTech, EdTech"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <MapPin className="h-4 w-4" /> Current Location
              </label>
              <Input
                value={form.currentLocation}
                onChange={(e) => setForm({ ...form, currentLocation: e.target.value })}
                placeholder="City, Country"
              />
            </div>
          </CardContent>
        </Card>

        {/* Bio Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Sparkles className="h-4 w-4 text-white" />
              </span>
              Bio
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="A short bio about yourself..."
              rows={3}
              className="resize-y"
            />
            <p className="text-xs text-gray-400 mt-2">Supports Markdown formatting</p>
          </CardContent>
        </Card>

        {/* Vision Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Target className="h-4 w-4 text-white" />
              </span>
              Vision
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.vision}
              onChange={(e) => setForm({ ...form, vision: e.target.value })}
              placeholder="Your personal or professional vision statement..."
              rows={3}
              className="resize-y"
            />
          </CardContent>
        </Card>

        {/* Story Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800">
                <BookOpen className="h-4 w-4 text-white" />
              </span>
              My Story
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.story}
              onChange={(e) => setForm({ ...form, story: e.target.value })}
              placeholder="Your background, journey, and what brought you here..."
              rows={4}
              className="resize-y"
            />
          </CardContent>
        </Card>

        {/* Expertise Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                <Wrench className="h-4 w-4 text-white" />
              </span>
              Expertise
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.expertise}
              onChange={(e) => setForm({ ...form, expertise: e.target.value })}
              placeholder="Skills, technologies, areas of focus..."
              rows={3}
              className="resize-y"
            />
          </CardContent>
        </Card>

        {/* Community Contribution */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
                <Handshake className="h-4 w-4 text-white" />
              </span>
              Community Contribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.connectionNote}
              onChange={(e) => setForm({ ...form, connectionNote: e.target.value })}
              placeholder="How you contribute to the community..."
              rows={3}
              className="resize-y"
            />
          </CardContent>
        </Card>

        {/* Achievements */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600">
                <Award className="h-4 w-4 text-white" />
              </span>
              Achievements
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              value={form.achievements}
              onChange={(e) => setForm({ ...form, achievements: e.target.value })}
              placeholder="Notable accomplishments, certifications, awards..."
              rows={3}
              className="resize-y"
            />
          </CardContent>
        </Card>

        {/* Alumni Details — only for alumni */}
        {isAlumni && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                  <GraduationCap className="h-4 w-4 text-white" />
                </span>
                Academic Background
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Passout Year</label>
                  <Input
                    value={form.passoutYear}
                    onChange={(e) => setForm({ ...form, passoutYear: e.target.value })}
                    placeholder="e.g. 2022"
                    type="number"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Degree</label>
                  <Input
                    value={form.degree}
                    onChange={(e) => setForm({ ...form, degree: e.target.value })}
                    placeholder="e.g. B.Tech"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-600">Branch</label>
                  <Input
                    value={form.branch}
                    onChange={(e) => setForm({ ...form, branch: e.target.value })}
                    placeholder="e.g. Computer Science"
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Social Links */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-pink-500">
                <Globe className="h-4 w-4 text-white" />
              </span>
              Social Links
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Github className="h-4 w-4" /> GitHub
                </label>
                <Input
                  value={form.githubUsername}
                  onChange={(e) => setForm({ ...form, githubUsername: e.target.value })}
                  placeholder="username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </label>
                <Input
                  value={form.linkedinUsername}
                  onChange={(e) => setForm({ ...form, linkedinUsername: e.target.value })}
                  placeholder="username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Twitter className="h-4 w-4" /> Twitter
                </label>
                <Input
                  value={form.twitterUsername}
                  onChange={(e) => setForm({ ...form, twitterUsername: e.target.value })}
                  placeholder="username"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Lightbulb className="h-4 w-4" /> Website
                </label>
                <Input
                  value={form.personalWebsite}
                  onChange={(e) => setForm({ ...form, personalWebsite: e.target.value })}
                  placeholder="https://..."
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Save Button */}
        <div className="flex items-center justify-between pt-2 pb-8">
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={saving}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white hover:from-amber-600 hover:to-orange-600 px-8"
          >
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            Save Changes
          </Button>
        </div>
      </form>
    </div>
  );
}
