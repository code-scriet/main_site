/**
 * AdminQuizCreator — form to create/edit a quiz with dynamic questions.
 * Multi-step wizard: step 1 = quiz meta, step 2 = add questions, step 3 = review & create, step 4 = success.
 */

import { useState, useCallback, useRef } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '@/context/AuthContext';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Plus,
  Trash2,
  ArrowLeft,
  ArrowRight,
  Save,
  GripVertical,
  CheckCircle,
  CircleDot,
  Type,
  BarChart3,
  Star,
  Image,
  Copy,
  Download,
  ExternalLink,
  Check,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type QuestionType = 'MCQ' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'POLL' | 'RATING';

interface QuestionDraft {
  id: string;
  questionText: string;
  questionType: QuestionType;
  options: string[];
  correctAnswer: string;
  timeLimitSeconds: number;
  points: number;
  mediaUrl: string;
}

function createEmptyQuestion(): QuestionDraft {
  return {
    id: crypto.randomUUID(),
    questionText: '',
    questionType: 'MCQ',
    options: ['', '', '', ''],
    correctAnswer: '',
    timeLimitSeconds: 20,
    points: 100,
    mediaUrl: '',
  };
}

const STEP_LABELS = ['Details', 'Questions', 'Review'];

export default function AdminQuizCreator() {
  const navigate = useNavigate();
  useAuth(); // ensure authenticated
  const { quizId: editId } = useParams<{ quizId: string }>();

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Success screen state
  const [createdQuiz, setCreatedQuiz] = useState<{ id: string; pin: string } | null>(null);
  const [pinCopied, setPinCopied] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // Quiz meta
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Questions
  const [questions, setQuestions] = useState<QuestionDraft[]>([createEmptyQuestion()]);
  const [activeQIndex, setActiveQIndex] = useState(0);

  const activeQ = questions[activeQIndex] ?? null;

  // Update a specific question
  const updateQuestion = useCallback(
    (index: number, patch: Partial<QuestionDraft>) => {
      setQuestions((prev) => {
        const copy = [...prev];
        copy[index] = { ...copy[index], ...patch };
        return copy;
      });
    },
    [],
  );

  // Add question
  const addQuestion = useCallback(() => {
    const newQ = createEmptyQuestion();
    setQuestions((prev) => [...prev, newQ]);
    setActiveQIndex(questions.length);
  }, [questions.length]);

  // Remove question
  const removeQuestion = useCallback(
    (index: number) => {
      if (questions.length <= 1) return;
      setQuestions((prev) => prev.filter((_, i) => i !== index));
      if (activeQIndex >= index && activeQIndex > 0) {
        setActiveQIndex((prev) => prev - 1);
      }
    },
    [questions.length, activeQIndex],
  );

  // Duplicate question
  const duplicateQuestion = useCallback(
    (index: number) => {
      const original = questions[index];
      const dup: QuestionDraft = {
        ...original,
        id: crypto.randomUUID(),
        questionText: original.questionText + ' (copy)',
      };
      setQuestions((prev) => {
        const copy = [...prev];
        copy.splice(index + 1, 0, dup);
        return copy;
      });
      setActiveQIndex(index + 1);
    },
    [questions],
  );

  // Validation
  const validateQuiz = (): string | null => {
    if (!title.trim()) return 'Quiz title is required';
    if (questions.length === 0) return 'Add at least one question';
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.questionText.trim()) return `Question ${i + 1}: text is required`;
      if (q.questionType === 'MCQ' || q.questionType === 'POLL') {
        const nonEmpty = q.options.filter((o) => o.trim());
        if (nonEmpty.length < 2) return `Question ${i + 1}: at least 2 options needed`;
      }
      if (q.questionType !== 'POLL' && q.questionType !== 'RATING' && !q.correctAnswer.trim()) {
        return `Question ${i + 1}: correct answer is required`;
      }
    }
    return null;
  };

  // Copy PIN handler
  const handleCopyPin = async () => {
    if (!createdQuiz?.pin) return;
    await navigator.clipboard.writeText(createdQuiz.pin);
    setPinCopied(true);
    setTimeout(() => setPinCopied(false), 2000);
  };

  // Download QR as PNG
  const handleDownloadQR = async () => {
    if (!qrRef.current) return;
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(qrRef.current, { backgroundColor: '#ffffff', scale: 3 });
      const link = document.createElement('a');
      link.download = `quiz-${createdQuiz?.pin || 'qr'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch { /* ignore */ }
  };

  // Submit
  const handleSubmit = async () => {
    const err = validateQuiz();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setIsSubmitting(true);

    try {
      const token = localStorage.getItem('token');
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5001/api';
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        questions: questions.map((q, i) => ({
          position: i,
          questionText: q.questionText.trim(),
          questionType: q.questionType,
          options:
            q.questionType === 'MCQ' || q.questionType === 'POLL'
              ? q.options.filter((o) => o.trim())
              : q.questionType === 'TRUE_FALSE'
                ? ['True', 'False']
                : q.questionType === 'RATING'
                  ? ['1', '2', '3', '4', '5']
                  : [],
          correctAnswer: (q.questionType === 'POLL' || q.questionType === 'RATING') ? '' : q.correctAnswer.trim(),
          timeLimitSeconds: q.timeLimitSeconds,
          points: q.points,
          mediaUrl: q.mediaUrl.trim() || undefined,
        })),
      };

      const res = await fetch(`${apiUrl}/quiz`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error?.message || 'Failed to create quiz');

      const quizId = data.data.id;

      // Immediately open the quiz (DRAFT → WAITING) so the lobby is ready
      const openRes = await fetch(`${apiUrl}/quiz/${quizId}/open`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const openData = await openRes.json();
      if (!openData.success) throw new Error(openData.error?.message || 'Failed to open quiz');

      // Show success screen instead of navigating
      const pin = openData.data?.pin || data.data?.pin || '';
      setCreatedQuiz({ id: quizId, pin });
      setStep(4);
    } catch (e: any) {
      setError(e.message || 'Failed to create quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const joinUrl = createdQuiz
    ? `${window.location.origin}/quiz/join?pin=${createdQuiz.pin}`
    : '';

  return (
    <Layout>
      <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100">
      {/* Header — hidden on success screen */}
      {step <= 3 && (
        <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-amber-200/60">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/quiz')}
              className="text-amber-700 hover:bg-amber-50"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h1 className="text-lg font-bold text-amber-900 font-display">
              {editId ? 'Edit Quiz' : 'Create Quiz'}
            </h1>
            <div className="w-16" />
          </div>
        </div>
      )}

      {/* Step indicator — hidden on success */}
      {step <= 3 && (
        <div className="max-w-4xl mx-auto px-4 pt-6">
          <div className="flex items-center justify-center gap-0 mb-8">
            {[1, 2, 3].map((s) => (
              <div key={s} className="flex items-center">
                <button
                  onClick={() => s < step && setStep(s)}
                  disabled={s > step}
                  className="flex flex-col items-center gap-1"
                >
                  <div
                    className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300',
                      step === s
                        ? 'bg-gradient-to-br from-orange-500 to-amber-600 text-white shadow-md shadow-amber-300/40'
                        : step > s
                          ? 'bg-green-500 text-white'
                          : 'bg-amber-100 text-amber-700/40',
                    )}
                  >
                    {step > s ? <Check className="h-4 w-4" /> : s}
                  </div>
                  <span className={cn(
                    'text-[10px] font-semibold',
                    step >= s ? 'text-amber-800' : 'text-amber-700/30',
                  )}>
                    {STEP_LABELS[s - 1]}
                  </span>
                </button>
                {s < 3 && (
                  <div className={cn(
                    'w-16 sm:w-24 h-0.5 mx-1 mt-[-12px] rounded-full transition-colors duration-300',
                    step > s ? 'bg-green-500' : 'bg-amber-200',
                  )} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          {/* Step 1: Quiz Meta */}
          {step === 1 && (
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-amber-900 font-display">Quiz Details</h2>
              <Card className="border-amber-200/60 shadow-md">
                <CardContent className="p-6 space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-amber-800 mb-1.5">Title *</label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. JavaScript Fundamentals Quiz"
                      className="text-lg border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-amber-800 mb-1.5">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Optional description..."
                      rows={3}
                      className="w-full rounded-lg border-2 border-amber-200 px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-colors duration-200"
                    />
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end">
                <Button
                  onClick={() => setStep(2)}
                  disabled={!title.trim()}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
                >
                  Next: Add Questions
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Questions */}
          {step === 2 && (
            <motion.div
              key="step2"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-amber-900 font-display">Questions</h2>
                <Badge variant="outline" className="border-amber-300 text-amber-700 bg-amber-50 font-mono text-xs">
                  {questions.length} question{questions.length !== 1 ? 's' : ''}
                </Badge>
              </div>

              <div className="flex gap-6">
                {/* Question sidebar */}
                <div className="w-48 flex-shrink-0 space-y-1 hidden sm:block">
                  {questions.map((q, i) => (
                    <button
                      key={q.id}
                      onClick={() => setActiveQIndex(i)}
                      className={cn(
                        'w-full px-3 py-2 rounded-lg text-left text-sm flex items-center gap-2 transition-all duration-200',
                        activeQIndex === i
                          ? 'bg-amber-100 border border-amber-300 font-medium text-amber-900 shadow-sm'
                          : 'hover:bg-amber-50 text-amber-700/60',
                      )}
                    >
                      <GripVertical className="h-3 w-3 text-amber-400/50 flex-shrink-0 cursor-grab" />
                      <span className="truncate">
                        {q.questionText.trim() || `Question ${i + 1}`}
                      </span>
                    </button>
                  ))}
                  {/* "Add Question" — dashed border card */}
                  <button
                    onClick={addQuestion}
                    className="w-full px-3 py-2.5 rounded-lg border-2 border-dashed border-amber-300 text-amber-600 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-amber-50 hover:border-amber-400 transition-colors duration-200"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add
                  </button>
                </div>

                {/* Mobile question nav */}
                <div className="sm:hidden flex gap-1.5 overflow-x-auto pb-2 w-full">
                  {questions.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => setActiveQIndex(i)}
                      className={cn(
                        'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors',
                        activeQIndex === i
                          ? 'bg-amber-500 text-white'
                          : 'bg-amber-100 text-amber-700',
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={addQuestion}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs border-2 border-dashed border-amber-300 text-amber-500 flex-shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Question editor */}
                {activeQ && (
                  <Card className="flex-1 border-amber-200/60 shadow-md">
                    <CardContent className="p-5 sm:p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                          Question {activeQIndex + 1}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateQuestion(activeQIndex)}
                            title="Duplicate"
                            className="text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => removeQuestion(activeQIndex)}
                            disabled={questions.length <= 1}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {/* Question type */}
                      <div>
                        <label className="block text-sm font-semibold text-amber-800 mb-2">Type</label>
                        <div className="flex gap-2 flex-wrap">
                          {([
                            { type: 'MCQ', label: 'Multiple Choice', icon: CircleDot },
                            { type: 'TRUE_FALSE', label: 'True / False', icon: CheckCircle },
                            { type: 'SHORT_ANSWER', label: 'Short Answer', icon: Type },
                            { type: 'POLL', label: 'Poll', icon: BarChart3 },
                            { type: 'RATING', label: 'Rating', icon: Star },
                          ] as const).map(({ type, label, icon: Icon }) => (
                            <button
                              key={type}
                              onClick={() =>
                                updateQuestion(activeQIndex, {
                                  questionType: type,
                                  correctAnswer: (type === 'POLL' || type === 'RATING') ? '' : activeQ.correctAnswer,
                                  options:
                                    type === 'TRUE_FALSE'
                                      ? ['True', 'False']
                                      : type === 'SHORT_ANSWER' || type === 'RATING'
                                        ? []
                                        : activeQ.options.length >= 2
                                          ? activeQ.options
                                          : ['', '', '', ''],
                                })
                              }
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all duration-200',
                                activeQ.questionType === type
                                  ? 'bg-amber-100 border-amber-400 text-amber-800 font-semibold shadow-sm'
                                  : 'border-amber-200 hover:bg-amber-50 text-amber-700/60',
                              )}
                            >
                              <Icon className="h-4 w-4" />
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Question text */}
                      <div>
                        <label className="block text-sm font-semibold text-amber-800 mb-1.5">Question *</label>
                        <textarea
                          value={activeQ.questionText}
                          onChange={(e) => updateQuestion(activeQIndex, { questionText: e.target.value })}
                          placeholder="Enter question text..."
                          rows={3}
                          className="w-full rounded-lg border-2 border-amber-200 px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-colors duration-200"
                        />
                      </div>

                      {/* Options (MCQ / POLL) */}
                      {(activeQ.questionType === 'MCQ' || activeQ.questionType === 'POLL') && (
                        <div>
                          <label className="block text-sm font-semibold text-amber-800 mb-2">
                            Options {activeQ.questionType === 'MCQ' && <span className="font-normal text-amber-600/60 text-xs ml-1">— click circle to mark correct</span>}
                          </label>
                          <div className="space-y-2">
                            {activeQ.options.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                {activeQ.questionType === 'MCQ' && (
                                  <button
                                    onClick={() => updateQuestion(activeQIndex, { correctAnswer: opt })}
                                    className={cn(
                                      'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200',
                                      opt && activeQ.correctAnswer === opt
                                        ? 'border-green-500 bg-green-500 text-white scale-110'
                                        : 'border-amber-300 hover:border-amber-400',
                                    )}
                                    title="Mark as correct"
                                  >
                                    {opt && activeQ.correctAnswer === opt && (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                                <Input
                                  value={opt}
                                  onChange={(e) => {
                                    const newOpts = [...activeQ.options];
                                    newOpts[oi] = e.target.value;
                                    updateQuestion(activeQIndex, { options: newOpts });
                                  }}
                                  placeholder={`Option ${oi + 1}`}
                                  className="flex-1 border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
                                />
                                {activeQ.options.length > 2 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const newOpts = activeQ.options.filter((_, idx) => idx !== oi);
                                      updateQuestion(activeQIndex, { options: newOpts });
                                    }}
                                    className="text-amber-400 hover:text-red-500 hover:bg-red-50"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            ))}
                            {activeQ.options.length < 6 && (
                              <button
                                onClick={() =>
                                  updateQuestion(activeQIndex, { options: [...activeQ.options, ''] })
                                }
                                className="w-full py-2 rounded-lg border-2 border-dashed border-amber-200 text-amber-600 text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-amber-50 hover:border-amber-300 transition-colors duration-200"
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add Option
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* True/False correct answer */}
                      {activeQ.questionType === 'TRUE_FALSE' && (
                        <div>
                          <label className="block text-sm font-semibold text-amber-800 mb-2">Correct Answer *</label>
                          <div className="flex gap-3">
                            {['True', 'False'].map((val) => (
                              <button
                                key={val}
                                onClick={() => updateQuestion(activeQIndex, { correctAnswer: val })}
                                className={cn(
                                  'flex-1 px-6 py-3 rounded-xl border-2 font-semibold transition-all duration-200',
                                  activeQ.correctAnswer === val
                                    ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                                    : 'border-amber-200 hover:bg-amber-50 text-amber-700/60',
                                )}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Short answer correct answer */}
                      {activeQ.questionType === 'SHORT_ANSWER' && (
                        <div>
                          <label className="block text-sm font-semibold text-amber-800 mb-1.5">
                            Correct Answer * <span className="font-normal text-amber-600/40 text-xs">(case-insensitive match)</span>
                          </label>
                          <Input
                            value={activeQ.correctAnswer}
                            onChange={(e) => updateQuestion(activeQIndex, { correctAnswer: e.target.value })}
                            placeholder="Expected answer..."
                            className="border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
                          />
                        </div>
                      )}

                      {/* Rating preview */}
                      {activeQ.questionType === 'RATING' && (
                        <Card className="border-amber-200/60 bg-amber-50/50">
                          <CardContent className="p-4 text-center">
                            <p className="text-sm text-amber-800 mb-2 font-semibold">Preview: 1–5 Star Rating</p>
                            <div className="flex justify-center gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <span key={s} className="text-2xl text-amber-400">★</span>
                              ))}
                            </div>
                            <p className="text-xs text-amber-600/50 mt-2">No correct answer — responses are collected as feedback</p>
                          </CardContent>
                        </Card>
                      )}

                      {/* Settings row */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-semibold text-amber-800 mb-1.5">
                            Time Limit (seconds)
                          </label>
                          <Input
                            type="number"
                            min={5}
                            max={120}
                            value={activeQ.timeLimitSeconds}
                            onChange={(e) =>
                              updateQuestion(activeQIndex, {
                                timeLimitSeconds: Math.max(5, Math.min(120, parseInt(e.target.value) || 20)),
                              })
                            }
                            className="border-amber-200 focus:border-amber-400 focus:ring-amber-400/20 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-semibold text-amber-800 mb-1.5">Points</label>
                          <Input
                            type="number"
                            min={10}
                            max={500}
                            value={activeQ.points}
                            onChange={(e) =>
                              updateQuestion(activeQIndex, {
                                points: Math.max(10, Math.min(500, parseInt(e.target.value) || 100)),
                              })
                            }
                            className="border-amber-200 focus:border-amber-400 focus:ring-amber-400/20 font-mono"
                          />
                        </div>
                      </div>

                      {/* Media URL */}
                      <div>
                        <label className="block text-sm font-semibold text-amber-800 mb-1.5">
                          Media URL <span className="font-normal text-amber-600/40 text-xs">(optional image)</span>
                        </label>
                        <div className="flex gap-2">
                          <Image className="h-5 w-5 text-amber-400 mt-2" />
                          <Input
                            value={activeQ.mediaUrl}
                            onChange={(e) => updateQuestion(activeQIndex, { mediaUrl: e.target.value })}
                            placeholder="https://example.com/image.png"
                            className="flex-1 border-amber-200 focus:border-amber-400 focus:ring-amber-400/20"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
                >
                  Review Quiz
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <motion.div
              key="step3"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              className="space-y-6"
            >
              <h2 className="text-2xl font-bold text-amber-900 font-display">Review Quiz</h2>

              <Card className="border-amber-200/60 shadow-md">
                <CardContent className="p-6">
                  <h3 className="text-xl font-bold text-amber-900 font-display">{title}</h3>
                  {description && <p className="text-amber-700/60 mt-1 text-sm">{description}</p>}
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <Badge className="bg-amber-100 text-amber-800 border-amber-300">
                      {questions.length} question{questions.length !== 1 ? 's' : ''}
                    </Badge>
                    <Badge variant="outline" className="border-amber-300 text-amber-700 font-mono text-xs">
                      ~{questions.reduce((s, q) => s + q.timeLimitSeconds, 0)}s total
                    </Badge>
                    <Badge variant="outline" className="border-amber-300 text-amber-700 font-mono text-xs">
                      {questions.reduce((s, q) => s + q.points, 0)} pts max
                    </Badge>
                  </div>
                </CardContent>
              </Card>

              <div className="space-y-2">
                {questions.map((q, i) => (
                  <Card key={q.id} className="border-amber-200/60">
                    <CardContent className="p-4 flex items-start gap-3">
                      <span className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0 shadow-sm">
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-amber-900 truncate text-sm">{q.questionText || '(empty)'}</p>
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 px-1.5 py-0">
                            {q.questionType.replace('_', ' ')}
                          </Badge>
                          <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 px-1.5 py-0 font-mono">
                            {q.timeLimitSeconds}s
                          </Badge>
                          <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 px-1.5 py-0 font-mono">
                            {q.points}pts
                          </Badge>
                          {q.questionType !== 'POLL' && q.questionType !== 'RATING' && q.correctAnswer && (
                            <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300 px-1.5 py-0">
                              ✓ {q.correctAnswer}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-red-50 border border-red-200 rounded-xl p-3 text-red-600 text-sm font-medium"
                >
                  {error}
                </motion.div>
              )}

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(2)} className="border-amber-300 text-amber-700 hover:bg-amber-50">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Edit Questions
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isSubmitting}
                  className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
                  size="lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Save className="h-5 w-5 mr-2" />
                      Create & Open Quiz
                    </>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 4: Success Screen — full-screen with big PIN, QR, actions */}
          {step === 4 && createdQuiz && (
            <motion.div
              key="step4"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="flex flex-col items-center gap-6 py-8"
            >
              {/* Success icon */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: 'spring', stiffness: 200, damping: 15 }}
              >
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-green-400 to-emerald-500 flex items-center justify-center shadow-lg shadow-green-300/40">
                  <Sparkles className="h-10 w-10 text-white" />
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="text-center"
              >
                <h2 className="text-2xl sm:text-3xl font-bold text-amber-900 font-display">Quiz Created!</h2>
                <p className="text-amber-700/60 mt-1">"{title}" is ready. Share the PIN to get started.</p>
              </motion.div>

              {/* Huge PIN card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
                className="w-full max-w-md"
              >
                <Card className="border-amber-300/60 shadow-xl overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 p-1" />
                  <CardContent className="p-6 sm:p-8 text-center">
                    <p className="text-xs font-semibold text-amber-700/50 uppercase tracking-widest mb-3">Your Game PIN</p>
                    <div className="flex items-center justify-center gap-2 sm:gap-3">
                      {createdQuiz.pin.split('').map((digit, i) => (
                        <motion.span
                          key={i}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.6 + i * 0.08 }}
                          className="w-11 h-14 sm:w-14 sm:h-16 rounded-xl bg-amber-50 border-2 border-amber-200 flex items-center justify-center text-2xl sm:text-3xl font-black text-amber-900 font-mono"
                        >
                          {digit}
                        </motion.span>
                      ))}
                    </div>
                    <button
                      onClick={handleCopyPin}
                      className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-amber-100 text-amber-800 text-sm font-semibold hover:bg-amber-200 transition-colors duration-200"
                    >
                      {pinCopied ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy PIN
                        </>
                      )}
                    </button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* QR Code */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="w-full max-w-xs"
              >
                <Card className="border-amber-200/60 shadow-md">
                  <CardContent className="p-5 flex flex-col items-center">
                    <div ref={qrRef} className="bg-white p-3 rounded-xl">
                      <QRCodeSVG value={joinUrl} size={160} level="M" />
                    </div>
                    <p className="text-[10px] text-amber-600/40 mt-2 text-center break-all">{joinUrl}</p>
                    <button
                      onClick={handleDownloadQR}
                      className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download QR
                    </button>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md"
              >
                <Button
                  asChild
                  className="w-full sm:flex-1 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md"
                  size="lg"
                >
                  <Link to={`/quiz/${createdQuiz.id}`}>
                    <ExternalLink className="h-5 w-5 mr-2" />
                    Go to Lobby
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  className="w-full sm:flex-1 border-amber-300 text-amber-700 hover:bg-amber-50"
                  size="lg"
                >
                  <Link to="/quiz">
                    <ArrowLeft className="h-5 w-5 mr-2" />
                    Back to Quizzes
                  </Link>
                </Button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>
    </Layout>
  );
}
