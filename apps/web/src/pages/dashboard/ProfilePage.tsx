import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { api } from '@/lib/api';
import { formatDate } from '@/lib/dateUtils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  User, 
  Mail, 
  Calendar, 
  Shield, 
  Github, 
  Linkedin, 
  Twitter, 
  Globe, 
  Save, 
  Loader2, 
  Lock,
  CheckCircle,
  AlertCircle,
  GraduationCap,
  Phone
} from 'lucide-react';

// Course and branch options
const COURSES = ['BTech', 'BSC', 'BCA', 'MCA', 'MTech', 'MSC'] as const;
const BRANCH_OPTIONS: Record<string, string[]> = {
  'BTech': ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AIML', 'DS', 'AG'],
  'MTech': ['CSE', 'IT', 'ECE', 'EE', 'ME', 'CE', 'AIML', 'DS', 'AG'],
  'BSC': ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Statistics'],
  'MSC': ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'Statistics'],
  'BCA': ['General'],
  'MCA': ['General'],
};
const YEARS = ['1st Year', '2nd Year', '3rd Year', '4th Year'] as const;

interface ProfileData {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  bio?: string;
  phone?: string;
  course?: string;
  branch?: string;
  year?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  twitterUrl?: string;
  websiteUrl?: string;
  createdAt: string;
  hasPassword?: boolean;
  oauthProvider?: string;
  _count: { registrations: number; qotdSubmissions: number };
}

export default function ProfilePage() {
  const { token, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Form fields
  const [name, setName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [phone, setPhone] = useState('');
  const [course, setCourse] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [twitterUrl, setTwitterUrl] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  
  // Get available branches based on selected course
  const availableBranches = course ? (BRANCH_OPTIONS[course] || []) : [];  
  // Password change
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [isAddingPassword, setIsAddingPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const [pendingEventId, setPendingEventId] = useState<string | null>(null);

  useEffect(() => {
    // Check for pending event registration on mount (storage OR navigation state)
    // Read once and store in state — avoid re-reading localStorage later
    const statePendingId = location.state?.pendingEventId;
    const storagePendingId = localStorage.getItem('pendingEventRegistration');

    const pendingId = statePendingId || storagePendingId;

    if (pendingId) {
      // Ensure it's in localStorage for persistence if page refreshed
      if (!storagePendingId) {
        localStorage.setItem('pendingEventRegistration', pendingId);
      }
      setPendingEventId(pendingId);
    }

    const fetchProfile = async () => {
      if (!token) return;
      try {
        const data = await api.getProfile(token);
        setProfile(data);
        setName(data.name || '');
        setBio(data.bio || '');
        setAvatarUrl(data.avatar || '');
        setPhone(data.phone || '');
        setCourse(data.course || '');
        setBranch(data.branch || '');
        setYear(data.year || '');
        setGithubUrl(data.githubUrl || '');
        setLinkedinUrl(data.linkedinUrl || '');
        setTwitterUrl(data.twitterUrl || '');
        setWebsiteUrl(data.websiteUrl || '');
      } catch (error) {
        setMessage({ type: 'error', text: 'Failed to load profile' });
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    setSaving(true);
    setMessage(null);

      // Validate phone if provided
      if (phone && !/^[0-9]{10}$/.test(phone)) {
        setMessage({ type: 'error', text: 'Phone number must be exactly 10 digits' });
        setSaving(false);
        return;
      }

    try {
      await api.updateProfile({
        name,
        bio,
        avatarUrl,
        phone,
        course,
        branch,
        year,
        githubUrl,
        linkedinUrl,
        twitterUrl,
        websiteUrl,
      }, token);
      
      // Refresh user context to update academic details
      await refreshUser();
      
      // Check for pending event registration (use state only — localStorage was read once on mount)
      if (pendingEventId) {
        localStorage.removeItem('pendingEventRegistration');
        setPendingEventId(null);
        setMessage({
          type: 'success',
          text: 'Profile updated! Redirecting you to complete event registration.',
        });
        setTimeout(() => {
          navigate(`/events/${pendingEventId}?register=1`);
        }, 1000);
        return;
      } else {
        setMessage({ type: 'success', text: 'Profile updated successfully! Redirecting...' });
        // Redirect to dashboard after a short delay
        setTimeout(() => {
          navigate('/dashboard');
        }, 1500);
      }
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update profile' });
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }
    
    setChangingPassword(true);
    setMessage(null);
    
    try {
      // Check if user is adding or changing password
      if (isAddingPassword || !profile?.hasPassword) {
        await api.addPassword(newPassword, token);
        setMessage({ type: 'success', text: 'Password added successfully! You can now sign in with email and password.' });
      } else {
        await api.changePassword(currentPassword, newPassword, token);
        setMessage({ type: 'success', text: 'Password changed successfully!' });
      }
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordForm(false);
      setIsAddingPassword(false);
      // Refresh profile to update hasPassword flag
      const refreshedProfile = await api.getProfile(token);
      setProfile(refreshedProfile);
    } catch (error) {
      setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Failed to update password' });
    } finally {
      setChangingPassword(false);
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'ADMIN': return 'bg-red-100 text-red-800 border-red-200';
      case 'CORE_MEMBER': return 'bg-purple-100 text-purple-800 border-purple-200';
      default: return 'bg-blue-100 text-blue-800 border-blue-200';
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  // Check if academic details are missing
  const needsAcademicDetails = !profile?.phone || !profile?.course || !profile?.branch || !profile?.year;

  return (
    <div className="max-w-4xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">My Profile</h1>
            <p className="text-gray-600 mt-1">Manage your account settings and profile information</p>
          </div>

          {/* Academic Details Required Banner */}
          {needsAcademicDetails && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-300 text-amber-800"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Complete Your Academic Details</p>
                  <p className="text-sm mt-1">Please fill in your Phone Number, Course, Branch, and Year to access all features including event registration.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Pending Registration Banner */}
          {pendingEventId && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 rounded-lg bg-blue-50 border border-blue-200 text-blue-800"
            >
              <div className="flex items-start gap-3">
                <Calendar className="h-5 w-5 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Finish Your Event Registration</p>
                  <p className="text-sm mt-1">You are almost there! Complete your profile below and click "Save Changes" to finish registering for the event.</p>
                </div>
              </div>
            </motion.div>
          )}

          {/* Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-6 p-4 rounded-lg flex items-center gap-2 ${
                message.type === 'success' 
                  ? 'bg-green-50 text-green-800 border border-green-200' 
                  : 'bg-red-50 text-red-800 border border-red-200'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle className="h-5 w-5" />
              ) : (
                <AlertCircle className="h-5 w-5" />
              )}
              {message.text}
            </motion.div>
          )}

          {/* Account Info Card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Shield className="h-5 w-5 text-amber-600" />
              Account Information
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Mail className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Email</p>
                  <p className="text-sm font-medium text-gray-900">{profile?.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <User className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Role</p>
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded border ${getRoleBadgeColor(profile?.role || '')}`}>
                    {profile?.role?.replace('_', ' ')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                <Calendar className="h-5 w-5 text-gray-400" />
                <div>
                  <p className="text-xs text-gray-500">Joined</p>
                  <p className="text-sm font-medium text-gray-900">
                    {formatDate(profile?.createdAt) || 'N/A'}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Profile Form */}
          <form onSubmit={handleSave}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <User className="h-5 w-5 text-amber-600" />
                Profile Details
              </h2>
              
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Display Name</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Your name"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="avatar">Avatar URL</Label>
                    <Input
                      id="avatar"
                      value={avatarUrl}
                      onChange={(e) => setAvatarUrl(e.target.value)}
                      placeholder="https://example.com/avatar.jpg"
                    />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="bio">Bio</Label>
                  <Textarea
                    id="bio"
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    placeholder="Tell us about yourself..."
                    rows={3}
                  />
                </div>
              </div>
            </div>

            {/* Academic Information */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-amber-600" />
                Academic Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="phone" className="flex items-center gap-2">
                    <Phone className="h-4 w-4" /> Phone Number
                  </Label>
                  <Input
                    id="phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                    placeholder="10-digit mobile number"
                    pattern="[0-9]{10}"
                    maxLength={10}
                  />
                </div>
                <div>
                  <Label htmlFor="course">Course</Label>
                  <select
                    id="course"
                    value={course}
                    onChange={(e) => {
                      setCourse(e.target.value);
                      setBranch(''); // Reset branch when course changes
                    }}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="">Select Course</option>
                    {COURSES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="branch">Branch</Label>
                  <select
                    id="branch"
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    disabled={!course}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="">Select Branch</option>
                    {availableBranches.map(b => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label htmlFor="year">Year</Label>
                  <select
                    id="year"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="w-full h-10 px-3 rounded-md border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  >
                    <option value="">Select Year</option>
                    {YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Social Links */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Globe className="h-5 w-5 text-amber-600" />
                Social Links
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="github" className="flex items-center gap-2">
                    <Github className="h-4 w-4" /> GitHub URL
                  </Label>
                  <Input
                    id="github"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/username"
                  />
                </div>
                <div>
                  <Label htmlFor="linkedin" className="flex items-center gap-2">
                    <Linkedin className="h-4 w-4" /> LinkedIn URL
                  </Label>
                  <Input
                    id="linkedin"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/username"
                  />
                </div>
                <div>
                  <Label htmlFor="twitter" className="flex items-center gap-2">
                    <Twitter className="h-4 w-4" /> Twitter URL
                  </Label>
                  <Input
                    id="twitter"
                    value={twitterUrl}
                    onChange={(e) => setTwitterUrl(e.target.value)}
                    placeholder="https://twitter.com/username"
                  />
                </div>
                <div>
                  <Label htmlFor="website" className="flex items-center gap-2">
                    <Globe className="h-4 w-4" /> Website URL
                  </Label>
                  <Input
                    id="website"
                    value={websiteUrl}
                    onChange={(e) => setWebsiteUrl(e.target.value)}
                    placeholder="https://yourwebsite.com"
                  />
                </div>
              </div>
            </div>

            <Button type="submit" disabled={saving} className="w-full md:w-auto">
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </form>

          {/* Password Change Section */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <Lock className="h-5 w-5 text-amber-600" />
                  Security
                </h2>
                {profile?.oauthProvider && profile.oauthProvider !== 'email' && !profile.hasPassword && (
                  <p className="text-sm text-gray-500 mt-1">
                    You signed in with {profile.oauthProvider}. Add a password to enable email/password login.
                  </p>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setShowPasswordForm(!showPasswordForm);
                  setIsAddingPassword(!profile?.hasPassword);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
              >
                {showPasswordForm ? 'Cancel' : (profile?.hasPassword ? 'Change Password' : 'Add Password')}
              </Button>
            </div>
            
            {showPasswordForm && (
              <motion.form
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                onSubmit={handlePasswordChange}
                className="space-y-4 pt-4 border-t border-gray-200"
              >
                {profile?.hasPassword && (
                  <div>
                    <Label htmlFor="currentPassword">Current Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      required={profile.hasPassword}
                    />
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="newPassword">New Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      minLength={8}
                      required
                      placeholder="At least 8 characters"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmPassword">Confirm New Password</Label>
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      minLength={8}
                      required
                      placeholder="Repeat password"
                    />
                  </div>
                </div>
                <Button type="submit" disabled={changingPassword}>
                  {changingPassword ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      {profile?.hasPassword ? 'Changing...' : 'Adding...'}
                    </>
                  ) : (
                    profile?.hasPassword ? 'Update Password' : 'Add Password'
                  )}
                </Button>
              </motion.form>
            )}
          </div>
        </motion.div>
      </div>
  );
}
