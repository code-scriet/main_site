import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  Chrome, 
  Github, 
  AlertCircle, 
  Loader2, 
  CheckCircle2,
  Users,
  Palette,
  Video,
  Briefcase,
  ArrowRight,
  Mail,
  Calendar,
  MessageSquare,
  ChevronDown
} from 'lucide-react';
import { api } from '@/lib/api';
import type { AuthProviders } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';

const teamRoles = [
  {
    id: 'TECHNICAL',
    name: 'Technical Team',
    icon: Users,
    description: 'Work on building projects, solving DSA problems, and mentoring peers in competitive programming.',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    id: 'DESIGNING',
    name: 'Designing Team',
    icon: Palette,
    description: 'Create stunning visuals, UI/UX designs, posters, and branding materials for the club.',
    color: 'from-purple-500 to-pink-500',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
  },
  {
    id: 'VIDEO_EDITING',
    name: 'Video Editing Team',
    icon: Video,
    description: 'Produce engaging video content, tutorials, event highlights, and promotional videos.',
    color: 'from-red-500 to-orange-500',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
  },
  {
    id: 'MANAGEMENT',
    name: 'Management Team',
    icon: Briefcase,
    description: 'Handle event coordination, sponsorships, outreach, and day-to-day club operations.',
    color: 'from-amber-500 to-yellow-500',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
];

const processSteps = [
  {
    icon: Mail,
    title: 'Submit Application',
    description: 'Fill out the form with your details and select the team you want to join.',
  },
  {
    icon: Calendar,
    title: 'Login & Select Slot',
    description: 'You\'ll receive login credentials via email. Login to select your interview slot.',
  },
  {
    icon: MessageSquare,
    title: 'Join WhatsApp Group',
    description: 'Check the announcements section for the WhatsApp group link for further communication.',
  },
];

type FormStep = 'role-selection' | 'details' | 'auth-options' | 'success';

export default function JoinUsPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [providers, setProviders] = useState<AuthProviders | null>(null);
  const [loading, setLoading] = useState(true);
  const [formStep, setFormStep] = useState<FormStep>('role-selection');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Form fields
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('');
  const [skills, setSkills] = useState('');

  // Prefill user data if logged in
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setEmail(user.email || '');
    }
  }, [user]);

  // Check for redirect after OAuth
  useEffect(() => {
    const hiringRole = searchParams.get('hiring_role');
    if (hiringRole && teamRoles.find(r => r.id === hiringRole)) {
      setSelectedRole(hiringRole);
      setFormStep('details');
    }
  }, [searchParams]);

  // Fetch available auth providers
  useEffect(() => {
    api.getProviders()
      .then(setProviders)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleRoleSelect = (roleId: string) => {
    setSelectedRole(roleId);
    setFormStep('details');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedRole) {
      setError('Please select a team to apply for');
      return;
    }
    
    if (!name.trim() || !email.trim() || !department.trim() || !year.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch(`${API_URL}/hiring/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(localStorage.getItem('token') && {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          }),
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          department: department.trim(),
          year: year.trim(),
          skills: skills.trim() || undefined,
          applyingRole: selectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to submit application');
      }

      setFormStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOAuthSignIn = (provider: 'google' | 'github') => {
    // Store hiring intent in localStorage
    localStorage.setItem('hiring_intent', JSON.stringify({
      role: selectedRole,
      name,
      phone,
      department,
      year,
      skills,
    }));
    
    window.location.href = `${API_URL}/auth/${provider}`;
  };

  if (loading) {
    return (
      <Layout>
        <section className="min-h-[80vh] flex items-center justify-center py-20 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
          <div className="text-center">
            <Loader2 className="h-12 w-12 animate-spin text-amber-600 mx-auto mb-4" />
            <p className="text-gray-600">Loading...</p>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <section className="min-h-screen py-12 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
        <div className="container mx-auto px-4">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-12"
          >
            <h1 className="text-4xl md:text-5xl font-bold text-amber-900 mb-4">
              Join the <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-600 to-orange-600">code.scriet</span> Team
            </h1>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Apply to become a core team member! We're looking for passionate individuals 
              who want to contribute to SCRIET's premier coding community.
            </p>
          </motion.div>

          {/* Process Steps */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="max-w-4xl mx-auto mb-12"
          >
            <div className="grid md:grid-cols-3 gap-6">
              {processSteps.map((step, index) => (
                <div key={step.title} className="relative">
                  <Card className="h-full bg-white/80 backdrop-blur-sm border-amber-200/50">
                    <CardContent className="p-6 text-center">
                      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-white mb-4">
                        <step.icon className="h-6 w-6" />
                      </div>
                      <div className="absolute -top-3 -left-3 w-8 h-8 rounded-full bg-amber-600 text-white flex items-center justify-center font-bold text-sm">
                        {index + 1}
                      </div>
                      <h3 className="font-semibold text-gray-900 mb-2">{step.title}</h3>
                      <p className="text-sm text-gray-600">{step.description}</p>
                    </CardContent>
                  </Card>
                  {index < processSteps.length - 1 && (
                    <div className="hidden md:block absolute top-1/2 -right-3 transform -translate-y-1/2 z-10">
                      <ArrowRight className="h-6 w-6 text-amber-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>

          {/* Main Form Area */}
          <div className="max-w-4xl mx-auto">
            <AnimatePresence mode="wait">
              {formStep === 'role-selection' && (
                <motion.div
                  key="role-selection"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <h2 className="text-2xl font-bold text-gray-900 text-center mb-8">
                    Which team would you like to join?
                  </h2>
                  <div className="grid md:grid-cols-2 gap-6">
                    {teamRoles.map((role) => (
                      <motion.div
                        key={role.id}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Card 
                          className={`cursor-pointer transition-all duration-300 hover:shadow-xl ${role.bgColor} ${role.borderColor} border-2 hover:border-amber-400`}
                          onClick={() => handleRoleSelect(role.id)}
                        >
                          <CardContent className="p-6">
                            <div className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-r ${role.color} text-white mb-4 shadow-lg`}>
                              <role.icon className="h-7 w-7" />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{role.name}</h3>
                            <p className="text-gray-600">{role.description}</p>
                            <div className="mt-4 flex items-center text-amber-600 font-medium">
                              Apply Now <ArrowRight className="ml-2 h-4 w-4" />
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              )}

              {formStep === 'details' && (
                <motion.div
                  key="details"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                >
                  <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-amber-200">
                    <CardHeader className="text-center border-b border-amber-100 pb-6">
                      <div className="flex items-center justify-center mb-4">
                        {selectedRole && (() => {
                          const role = teamRoles.find(r => r.id === selectedRole);
                          if (!role) return null;
                          return (
                            <div className={`inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-r ${role.color} text-white shadow-lg`}>
                              <role.icon className="h-8 w-8" />
                            </div>
                          );
                        })()}
                      </div>
                      <CardTitle className="text-2xl text-amber-900">
                        Apply for {teamRoles.find(r => r.id === selectedRole)?.name}
                      </CardTitle>
                      <CardDescription className="text-gray-600">
                        Fill in your details below. An interview will be scheduled after review.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="p-8">
                      {error && (
                        <motion.div
                          initial={{ opacity: 0, y: -10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3"
                        >
                          <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                          <p className="text-red-700">{error}</p>
                        </motion.div>
                      )}

                      <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Full Name <span className="text-red-500">*</span>
                            </label>
                            <Input
                              type="text"
                              value={name}
                              onChange={(e) => setName(e.target.value)}
                              placeholder="John Doe"
                              required
                              className="h-12"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Email Address <span className="text-red-500">*</span>
                            </label>
                            <Input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="john@example.com"
                              required
                              className="h-12"
                            />
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Phone Number
                            </label>
                            <Input
                              type="tel"
                              value={phone}
                              onChange={(e) => setPhone(e.target.value)}
                              placeholder="9876543210"
                              className="h-12"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Department/Branch <span className="text-red-500">*</span>
                            </label>
                            <Input
                              type="text"
                              value={department}
                              onChange={(e) => setDepartment(e.target.value)}
                              placeholder="Computer Science"
                              required
                              className="h-12"
                            />
                          </div>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Academic Year <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                              <select
                                value={year}
                                onChange={(e) => setYear(e.target.value)}
                                required
                                className="w-full h-12 px-4 pr-10 rounded-md border border-gray-300 bg-white text-gray-900 focus:border-amber-500 focus:ring-amber-500 appearance-none"
                              >
                                <option value="">Select Year</option>
                                <option value="1st Year">1st Year</option>
                                <option value="2nd Year">2nd Year</option>
                                <option value="3rd Year">3rd Year</option>
                                <option value="4th Year">4th Year</option>
                              </select>
                              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 pointer-events-none" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                              Skills (comma-separated)
                            </label>
                            <Input
                              type="text"
                              value={skills}
                              onChange={(e) => setSkills(e.target.value)}
                              placeholder="Python, JavaScript, React..."
                              className="h-12"
                            />
                          </div>
                        </div>

                        {/* Info Box */}
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                          <h4 className="font-semibold text-amber-900 mb-2 flex items-center gap-2">
                            <Mail className="h-4 w-4" /> What happens next?
                          </h4>
                          <ul className="text-sm text-amber-800 space-y-1">
                            <li>• You'll receive login credentials from <strong>code.scriet</strong> at your email</li>
                            <li>• Login to the recruitment portal and select your interview slot</li>
                            <li>• Join our WhatsApp group (link in announcements) for updates</li>
                          </ul>
                        </div>

                        <div className="flex gap-4 pt-4">
                          <Button
                            type="button"
                            variant="outline"
                            className="flex-1 h-12"
                            onClick={() => {
                              setSelectedRole(null);
                              setFormStep('role-selection');
                            }}
                          >
                            ← Change Team
                          </Button>
                          <Button
                            type="submit"
                            disabled={submitting}
                            className="flex-1 h-12 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                          >
                            {submitting ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Submitting...
                              </>
                            ) : (
                              <>
                                Submit Application
                                <ArrowRight className="ml-2 h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </div>
                      </form>

                      {/* OAuth Options */}
                      {(providers?.google || providers?.github) && (
                        <div className="mt-8 pt-6 border-t border-gray-200">
                          <p className="text-center text-sm text-gray-500 mb-4">
                            Or quickly fill your details using
                          </p>
                          <div className="flex gap-4 justify-center">
                            {providers.google && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleOAuthSignIn('google')}
                                className="gap-2"
                              >
                                <Chrome className="h-4 w-4" />
                                Google
                              </Button>
                            )}
                            {providers.github && (
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => handleOAuthSignIn('github')}
                                className="gap-2"
                              >
                                <Github className="h-4 w-4" />
                                GitHub
                              </Button>
                            )}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </motion.div>
              )}

              {formStep === 'success' && (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-lg mx-auto"
                >
                  <Card className="bg-white/90 backdrop-blur-sm shadow-xl border-green-200">
                    <CardContent className="p-8 text-center">
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: 'spring', delay: 0.2 }}
                        className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-green-100 text-green-600 mb-6"
                      >
                        <CheckCircle2 className="h-10 w-10" />
                      </motion.div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-4">
                        Application Submitted! 🎉
                      </h2>
                      <p className="text-gray-600 mb-6">
                        Thank you for applying to join the <strong>{teamRoles.find(r => r.id === selectedRole)?.name}</strong>!
                      </p>
                      
                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-left mb-6">
                        <h4 className="font-semibold text-amber-900 mb-3">Next Steps:</h4>
                        <ol className="text-sm text-amber-800 space-y-2 list-decimal list-inside">
                          <li>Check your email (<strong>{email}</strong>) for login credentials</li>
                          <li>Login to the recruitment portal using those credentials</li>
                          <li>Select your preferred interview slot</li>
                          <li>Join the WhatsApp group from the announcements section</li>
                        </ol>
                      </div>

                      <div className="flex gap-4">
                        <Button
                          variant="outline"
                          className="flex-1"
                          onClick={() => navigate('/')}
                        >
                          Go Home
                        </Button>
                        <Button
                          className="flex-1 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                          onClick={() => navigate('/announcements')}
                        >
                          View Announcements
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Note about regular membership */}
          {formStep !== 'success' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3 }}
              className="max-w-2xl mx-auto mt-12 text-center"
            >
              <p className="text-gray-600">
                Just want to attend events and be a member without joining the core team?{' '}
                <a href="/signin" className="text-amber-600 hover:text-amber-700 font-medium underline">
                  Sign up as a regular member
                </a>
              </p>
            </motion.div>
          )}
        </div>
      </section>
    </Layout>
  );
}
