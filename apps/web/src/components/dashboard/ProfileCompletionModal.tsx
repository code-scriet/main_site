import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  User, 
  Phone, 
  GraduationCap, 
  BookOpen, 
  Calendar,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { api } from '@/lib/api';

// Course and Branch configurations
const COURSES = [
  { value: 'BTech', label: 'B.Tech' },
  { value: 'BSC', label: 'B.Sc' },
  { value: 'BCA', label: 'BCA' },
  { value: 'MCA', label: 'MCA' },
  { value: 'MTech', label: 'M.Tech' },
  { value: 'MSC', label: 'M.Sc' },
] as const;

const BRANCHES: Record<string, { value: string; label: string }[]> = {
  BTech: [
    { value: 'CSE', label: 'Computer Science & Engineering' },
    { value: 'IT', label: 'Information Technology' },
    { value: 'ECE', label: 'Electronics & Communication' },
    { value: 'EE', label: 'Electrical Engineering' },
    { value: 'ME', label: 'Mechanical Engineering' },
    { value: 'CE', label: 'Civil Engineering' },
    { value: 'CSE-AI', label: 'CSE (Artificial Intelligence)' },
    { value: 'CSE-DS', label: 'CSE (Data Science)' },
    { value: 'AG', label: 'Agriculture Engineering' },
  ],
  BSC: [
    { value: 'CS', label: 'Computer Science' },
    { value: 'Physics', label: 'Physics' },
    { value: 'Chemistry', label: 'Chemistry' },
    { value: 'Mathematics', label: 'Mathematics' },
    { value: 'Biotechnology', label: 'Biotechnology' },
  ],
  BCA: [
    { value: 'BCA', label: 'Computer Applications' },
  ],
  MCA: [
    { value: 'MCA', label: 'Computer Applications' },
  ],
  MTech: [
    { value: 'CSE', label: 'Computer Science & Engineering' },
    { value: 'IT', label: 'Information Technology' },
    { value: 'ECE', label: 'Electronics & Communication' },
    { value: 'EE', label: 'Electrical Engineering' },
    { value: 'AG', label: 'Agriculture Engineering' },
  ],
  MSC: [
    { value: 'CS', label: 'Computer Science' },
    { value: 'Physics', label: 'Physics' },
    { value: 'Chemistry', label: 'Chemistry' },
    { value: 'Mathematics', label: 'Mathematics' },
  ],
};

const YEARS = [
  { value: '1st Year', label: '1st Year' },
  { value: '2nd Year', label: '2nd Year' },
  { value: '3rd Year', label: '3rd Year' },
  { value: '4th Year', label: '4th Year' },
];

interface ProfileCompletionModalProps {
  isOpen: boolean;
  userName: string;
  token: string;
  onComplete: () => void;
}

export function ProfileCompletionModal({ isOpen, userName, token, onComplete }: ProfileCompletionModalProps) {
  const [phone, setPhone] = useState('');
  const [course, setCourse] = useState('');
  const [branch, setBranch] = useState('');
  const [year, setYear] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableBranches = course ? BRANCHES[course] || [] : [];

  const validatePhone = (phone: string): boolean => {
    const phoneRegex = /^[6-9]\d{9}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!validatePhone(phone)) {
      setError('Please enter a valid 10-digit Indian mobile number');
      return;
    }

    if (!course || !branch || !year) {
      setError('Please fill in all fields');
      return;
    }

    setLoading(true);

    try {
      await api.updateProfile({ phone, course, branch, year }, token);
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  // Reset branch when course changes
  const handleCourseChange = (newCourse: string) => {
    setCourse(newCourse);
    setBranch('');
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 p-6 text-white">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-white/20 rounded-full">
                  <User className="h-6 w-6" />
                </div>
                <h2 className="text-2xl font-bold">Complete Your Profile</h2>
              </div>
              <p className="text-amber-100">
                Welcome, {userName}! Please complete your profile to continue.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="p-6 space-y-5">
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-3 rounded-lg bg-red-50 text-red-700 flex items-center gap-2 text-sm"
                >
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  {error}
                </motion.div>
              )}

              {/* Phone Number */}
              <div className="space-y-2">
                <Label htmlFor="phone" className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-amber-600" />
                  Mobile Number
                </Label>
                <Input
                  id="phone"
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="h-11"
                  required
                  maxLength={10}
                />
              </div>

              {/* Course */}
              <div className="space-y-2">
                <Label htmlFor="course" className="flex items-center gap-2">
                  <GraduationCap className="h-4 w-4 text-amber-600" />
                  Course
                </Label>
                <select
                  id="course"
                  value={course}
                  onChange={(e) => handleCourseChange(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                >
                  <option value="">Select your course</option>
                  {COURSES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Branch */}
              <div className="space-y-2">
                <Label htmlFor="branch" className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-amber-600" />
                  Branch / Specialization
                </Label>
                <select
                  id="branch"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  required
                  disabled={!course}
                >
                  <option value="">
                    {course ? 'Select your branch' : 'Select course first'}
                  </option>
                  {availableBranches.map((b) => (
                    <option key={b.value} value={b.value}>
                      {b.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Year */}
              <div className="space-y-2">
                <Label htmlFor="year" className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-amber-600" />
                  Current Year
                </Label>
                <select
                  id="year"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  className="w-full h-11 px-3 rounded-md border border-gray-300 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                  required
                >
                  <option value="">Select your year</option>
                  {YEARS.map((y) => (
                    <option key={y.value} value={y.value}>
                      {y.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit Button */}
              <Button
                type="submit"
                disabled={loading}
                className="w-full h-12 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-semibold text-lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-5 w-5 mr-2" />
                    Complete Profile
                  </>
                )}
              </Button>

              <p className="text-xs text-gray-500 text-center">
                This information helps us serve you better and is required for event registrations.
              </p>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
