import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/AuthContext';
import { api, type TeamMember } from '@/lib/api';
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
  Instagram,
  Shield,
  User,
} from 'lucide-react';

interface TeamMemberProfile extends TeamMember {
  userId?: string;
  slug?: string;
  bio?: string;
  vision?: string;
  story?: string;
  expertise?: string;
  achievements?: string;
  website?: string;
  user?: {
    id: string;
    name: string;
    email: string;
    avatar?: string;
  };
}

export default function EditTeamProfile() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, token } = useAuth();

  const [member, setMember] = useState<TeamMemberProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => { clearTimeout(successTimerRef.current); }, []);

  const [form, setForm] = useState({
    bio: '',
    vision: '',
    story: '',
    expertise: '',
    achievements: '',
    website: '',
    github: '',
    linkedin: '',
    twitter: '',
    instagram: '',
  });

  const isAdmin = user && ['ADMIN', 'PRESIDENT'].includes(user.role);

  useEffect(() => {
    if (!id || !token) return;

    const fetchMember = async () => {
      try {
        setLoading(true);
        const result = await api.getTeamMember(id) as TeamMemberProfile;
        setMember(result);

        // Check permissions
        const isOwner = user && result.userId === user.id;
        const isAdminUser = user && ['ADMIN', 'PRESIDENT'].includes(user.role);
        if (!isOwner && !isAdminUser) {
          navigate('/dashboard');
          return;
        }

        setForm({
          bio: result.bio || '',
          vision: result.vision || '',
          story: result.story || '',
          expertise: result.expertise || '',
          achievements: result.achievements || '',
          website: result.website || '',
          github: result.github || '',
          linkedin: result.linkedin || '',
          twitter: result.twitter || '',
          instagram: result.instagram || '',
        });
      } catch {
        setError('Failed to load team member profile');
      } finally {
        setLoading(false);
      }
    };

    fetchMember();
  }, [id, token, user, navigate]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !token || !member) return;

    try {
      setSaving(true);
      setError(null);
      await api.updateTeamMemberProfile(id, form, token);
      setSuccess('Profile updated successfully!');
      successTimerRef.current = setTimeout(() => setSuccess(null), 3000);
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

  if (error && !member) {
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

  if (!member) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
            <Link to="/dashboard" className="hover:text-amber-600 transition-colors">Dashboard</Link>
            <span>›</span>
            <span className="text-amber-600 font-medium">Edit Team Profile</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-3">
            Edit Profile
            <Badge variant="secondary" className="text-xs">{member.name}</Badge>
          </h1>
          <p className="text-sm text-gray-500 mt-1">Update your personal page content visible to visitors</p>
        </div>
        <div className="flex items-center gap-2">
          {member.slug && (
            <Link to={`/team/${member.slug}`} target="_blank">
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
          {isAdmin ? <Shield className="h-5 w-5 text-amber-600" /> : <User className="h-5 w-5 text-amber-600" />}
        </div>
        <div>
          <p className="text-sm font-medium text-amber-900">
            {isAdmin ? 'Admin Access' : 'Profile Owner'}
          </p>
          <p className="text-xs text-amber-700/70">
            {isAdmin ? 'You can edit this profile as an administrator.' : 'You are editing your own team profile.'}
          </p>
        </div>
      </motion.div>

      {/* Status Messages */}
      {success && (
        <div className="p-3 rounded-lg bg-green-100 border border-green-200 text-green-700 text-sm">
          {success}
        </div>
      )}
      {error && member && (
        <div className="p-3 rounded-lg bg-red-100 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* Bio Section */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-slate-600 to-slate-800">
                <BookOpen className="h-4 w-4 text-white" />
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
              Story
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
                <Lightbulb className="h-4 w-4 text-white" />
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

        {/* Achievements Section */}
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
                <label htmlFor="team-profile-github" className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Github className="h-4 w-4" /> GitHub
                </label>
                <Input
                  id="team-profile-github"
                  value={form.github}
                  onChange={(e) => setForm({ ...form, github: e.target.value })}
                  placeholder="username or URL"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="team-profile-linkedin" className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </label>
                <Input
                  id="team-profile-linkedin"
                  value={form.linkedin}
                  onChange={(e) => setForm({ ...form, linkedin: e.target.value })}
                  placeholder="username or URL"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="team-profile-twitter" className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Twitter className="h-4 w-4" /> Twitter
                </label>
                <Input
                  id="team-profile-twitter"
                  value={form.twitter}
                  onChange={(e) => setForm({ ...form, twitter: e.target.value })}
                  placeholder="username or URL"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="team-profile-instagram" className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Instagram className="h-4 w-4" /> Instagram
                </label>
                <Input
                  id="team-profile-instagram"
                  value={form.instagram}
                  onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                  placeholder="username or URL"
                />
              </div>
            </div>
            <div className="space-y-2">
              <label htmlFor="team-profile-website" className="text-sm font-medium text-gray-600 flex items-center gap-2">
                <Globe className="h-4 w-4" /> Website
              </label>
              <Input
                id="team-profile-website"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://..."
              />
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
