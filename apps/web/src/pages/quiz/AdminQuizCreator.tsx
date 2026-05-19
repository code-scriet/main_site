/**
 * AdminQuizCreator — form to create/edit a quiz with dynamic questions.
 * Multi-step wizard: step 1 = quiz meta, step 2 = add questions, step 3 = review & create, step 4 = success.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
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
  GripVertical,
  CheckCircle,
  CircleDot,
  Type,
  BarChart3,
  Star,
  ListChecks,
  MessageSquare,
  Image,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { cn, getWebAppOrigin } from '@/lib/utils';
import { api, type QuizQuestionInput } from '@/lib/api';

import {
  QUIZ_IMPORT_TEMPLATE_EXAMPLE,
  QUIZ_IMPORT_TEMPLATE_FILENAME,
  QUIZ_IMPORT_TEMPLATE_HEADERS,
  createEmptyQuestion,
  isUnscoredQuestion,
  usesOptions,
  type QuestionDraft,
  type QuestionType,
} from '@/lib/quizDrafts';
import { WizardStepper } from '@/components/admin/quiz-creator/WizardStepper';
import { Step1Details } from '@/components/admin/quiz-creator/Step1Details';
import { Step4Success } from '@/components/admin/quiz-creator/Step4Success';
import { Step3Review } from '@/components/admin/quiz-creator/Step3Review';

export default function AdminQuizCreator() {
  const navigate = useNavigate();
  const { token } = useAuth(); // ensure authenticated
  const { quizId: routeEditId } = useParams<{ quizId: string }>();
  const [searchParams] = useSearchParams();
  const queryEditId = searchParams.get('edit')?.trim() || '';
  const editId = routeEditId || queryEditId || undefined;

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [importError, setImportError] = useState('');
  const [importing, setImporting] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [loadingExistingQuiz, setLoadingExistingQuiz] = useState(false);
  const [submitMode, setSubmitMode] = useState<'draft' | 'open'>('draft');

  // Success screen state
  const [createdQuiz, setCreatedQuiz] = useState<{ id: string; pin: string | null; status: 'DRAFT' | 'WAITING' } | null>(null);
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
      const nonEmptyOptions = q.options.map((option) => option.trim()).filter(Boolean);
      if (!q.questionText.trim()) return `Question ${i + 1}: text is required`;
      if (nonEmptyOptions.length > 0 && new Set(nonEmptyOptions).size !== nonEmptyOptions.length) {
        return `Question ${i + 1}: option labels must be unique`;
      }
      if (usesOptions(q.questionType) && nonEmptyOptions.length < 2) {
        return `Question ${i + 1}: at least 2 options needed`;
      }
      if (q.questionType === 'MCQ' && !q.correctAnswer.trim()) {
        return `Question ${i + 1}: correct answer is required`;
      }
      if (q.questionType === 'MCQ' && q.correctAnswer.trim() && !nonEmptyOptions.includes(q.correctAnswer.trim())) {
        return `Question ${i + 1}: the correct answer must match one of the options`;
      }
      if (q.questionType === 'TRUE_FALSE' && !q.correctAnswer.trim()) {
        return `Question ${i + 1}: select True or False as the correct answer`;
      }
      if (q.questionType === 'SHORT_ANSWER' && !q.correctAnswer.trim()) {
        return `Question ${i + 1}: correct answer is required`;
      }
      if (q.questionType === 'MULTI_SELECT') {
        const selectedCorrectAnswers = q.correctAnswers.map((answer) => answer.trim()).filter(Boolean);
        if (selectedCorrectAnswers.length === 0) {
          return `Question ${i + 1}: mark at least one correct option`;
        }
        if (selectedCorrectAnswers.some((answer) => !nonEmptyOptions.includes(answer))) {
          return `Question ${i + 1}: every marked correct answer must match one of the options`;
        }
      }
    }
    return null;
  };

  const mapImportedQuestionToDraft = useCallback((question: QuizQuestionInput): QuestionDraft => {
    const normalizedOptions = Array.isArray(question.options) ? question.options : [];
    const normalizedCorrectAnswer = question.correctAnswer?.trim() || '';
    const parsedMultiSelectAnswers = question.questionType === 'MULTI_SELECT' && normalizedCorrectAnswer
      ? (() => {
        try {
          const parsed = JSON.parse(normalizedCorrectAnswer);
          return Array.isArray(parsed)
            ? parsed
              .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
              .filter(Boolean)
            : [];
        } catch {
          return normalizedCorrectAnswer
            .split(/[|,;]/)
            .map((entry) => entry.trim())
            .filter(Boolean);
        }
      })()
      : [];

    const nextOptions = usesOptions(question.questionType as QuestionType)
      ? (normalizedOptions.length > 0 ? normalizedOptions : ['', '', '', ''])
      : (question.questionType === 'TRUE_FALSE' ? ['True', 'False'] : []);

    return {
      id: crypto.randomUUID(),
      questionText: question.questionText,
      questionType: question.questionType as QuestionType,
      options: nextOptions,
      correctAnswer: question.questionType === 'MULTI_SELECT' ? '' : normalizedCorrectAnswer,
      correctAnswers: question.questionType === 'MULTI_SELECT' ? parsedMultiSelectAnswers : [],
      timeLimitSeconds: question.timeLimitSeconds,
      points: question.points,
      mediaUrl: question.mediaUrl || '',
    };
  }, []);

  useEffect(() => {
    if (!editId) {
      return;
    }

    if (!token) {
      setError('You need to sign in again to edit quizzes.');
      return;
    }

    let cancelled = false;

    const loadDraftForEdit = async () => {
      setLoadingExistingQuiz(true);
      setError('');
      try {
        const quiz = await api.getQuiz(editId, token);

        if (cancelled) {
          return;
        }

        if (quiz.status !== 'DRAFT') {
          setError('Only draft quizzes can be edited.');
          return;
        }

        setTitle(quiz.title || '');
        setDescription(quiz.description || '');

        const loadedQuestions = (quiz.questions || []).map(mapImportedQuestionToDraft);
        setQuestions(loadedQuestions.length > 0 ? loadedQuestions : [createEmptyQuestion()]);
        setActiveQIndex(0);
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load quiz for editing');
        }
      } finally {
        if (!cancelled) {
          setLoadingExistingQuiz(false);
        }
      }
    };

    void loadDraftForEdit();

    return () => {
      cancelled = true;
    };
  }, [editId, token, mapImportedQuestionToDraft]);

  const handleImportQuestions = async () => {
    if (!token) {
      setImportError('You need to sign in again to import quiz files.');
      return;
    }
    if (!importFile) {
      setImportError('Please select a CSV or XLSX file first.');
      return;
    }

    setImportError('');
    setImporting(true);
    try {
      const parsed = await api.importQuizFile(importFile, token);
      const importedDrafts = parsed.questions.map(mapImportedQuestionToDraft);
      if (importedDrafts.length === 0) {
        setImportError('No valid questions were found in the uploaded file.');
        return;
      }

      setQuestions(importedDrafts);
      setActiveQIndex(0);
      if (!title.trim() && parsed.titleSuggestion) {
        setTitle(parsed.titleSuggestion);
      }
      setStep(2);
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Failed to import quiz file');
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadImportTemplate = useCallback(() => {
    const csvContent = [
      QUIZ_IMPORT_TEMPLATE_HEADERS.join(','),
      QUIZ_IMPORT_TEMPLATE_EXAMPLE.join(','),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = QUIZ_IMPORT_TEMPLATE_FILENAME;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, []);

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
  const handleSubmit = async (mode: 'draft' | 'open') => {
    if (!token) {
      setError('You need to sign in again to create quizzes.');
      return;
    }

    const err = validateQuiz();
    if (err) {
      setError(err);
      return;
    }
    setError('');
    setSubmitMode(mode);
    setIsSubmitting(true);

    try {
      const body = {
        title: title.trim(),
        description: description.trim() || undefined,
        questions: questions.map((q, i) => ({
          position: i,
          questionText: q.questionText.trim(),
          questionType: q.questionType,
          options:
            usesOptions(q.questionType)
              ? q.options.filter((o) => o.trim())
              : q.questionType === 'TRUE_FALSE'
                ? ['True', 'False']
                : q.questionType === 'RATING'
                  ? ['1', '2', '3', '4', '5']
                  : [],
          correctAnswer:
            q.questionType === 'MULTI_SELECT'
              ? JSON.stringify(q.correctAnswers.map((answer) => answer.trim()).filter(Boolean))
              : isUnscoredQuestion(q.questionType)
                ? ''
                : q.correctAnswer.trim(),
          timeLimitSeconds: q.timeLimitSeconds,
          points: isUnscoredQuestion(q.questionType) ? 0 : q.points,
          mediaUrl: q.mediaUrl.trim() || undefined,
        })),
      };

      const created = editId
        ? await api.updateQuiz(editId, body, token).then(() => ({ id: editId }))
        : await api.createQuiz(body, token);

      if (mode === 'open') {
        const opened = await api.openQuiz(created.id, token);
        const openedPin = opened.pin || null;
        setCreatedQuiz({ id: created.id, pin: openedPin, status: 'WAITING' });
      } else {
        setCreatedQuiz({ id: created.id, pin: null, status: 'DRAFT' });
      }
      setStep(4);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save quiz');
    } finally {
      setIsSubmitting(false);
    }
  };

  const joinBaseOrigin = getWebAppOrigin();
  const joinUrl = createdQuiz?.pin
    ? `${joinBaseOrigin}/quiz/join?pin=${createdQuiz.pin}`
    : '';

  if (loadingExistingQuiz) {
    return (
      <Layout>
        <div data-dashboard="true" data-accent="rust" className="min-h-[60vh] flex items-center justify-center bg-[var(--bg-canvas)] text-[var(--ds-text-1)]">
          <div className="flex items-center gap-2 text-[var(--ds-text-1)]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Loading draft quiz...</span>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div data-dashboard="true" data-accent="rust" className="min-h-screen bg-[var(--bg-canvas)] text-[var(--ds-text-1)]">
      {/* Header — hidden on success screen */}
      {step <= 3 && (
        <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-[var(--accent-ring)]/60">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/quiz')}
              className="text-[var(--ds-text-2)] hover:bg-[var(--accent-subtle)]"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <h1 className="text-lg font-bold text-[var(--ds-text-1)] font-display">
              {editId ? 'Edit Quiz' : 'Create Quiz'}
            </h1>
            <div className="w-16" />
          </div>
        </div>
      )}

      {step <= 3 && <WizardStepper step={step} onJumpBack={setStep} />}

      <div className="max-w-4xl mx-auto px-4 pb-24">
        <AnimatePresence mode="wait">
          {/* Step 1: Quiz Meta */}
          {step === 1 && (
            <Step1Details
              title={title}
              onTitleChange={setTitle}
              description={description}
              onDescriptionChange={setDescription}
              importFile={importFile}
              onImportFileChange={setImportFile}
              importing={importing}
              importError={importError}
              onImportFileError={setImportError}
              onImportQuestions={handleImportQuestions}
              onDownloadTemplate={handleDownloadImportTemplate}
              onNext={() => setStep(2)}
            />
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
                <h2 className="text-2xl font-bold text-[var(--ds-text-1)] font-display">Questions</h2>
                <Badge variant="outline" className="border-[var(--accent-ring)] text-[var(--ds-text-2)] bg-[var(--accent-subtle)] font-mono text-xs">
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
                          ? 'bg-[var(--accent-subtle)] border border-[var(--accent-ring)] font-medium text-[var(--ds-text-1)] shadow-sm'
                          : 'hover:bg-[var(--accent-subtle)] text-[var(--ds-text-2)]/60',
                      )}
                    >
                      <GripVertical className="h-3 w-3 text-[var(--accent)]/50 flex-shrink-0 cursor-grab" />
                      <span className="truncate">
                        {q.questionText.trim() || `Question ${i + 1}`}
                      </span>
                    </button>
                  ))}
                  {/* "Add Question" — dashed border card */}
                  <button
                    onClick={addQuestion}
                    className="w-full px-3 py-2.5 rounded-lg border-2 border-dashed border-[var(--accent-ring)] text-[var(--accent)] text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-[var(--accent-subtle)] hover:border-[var(--accent)] transition-colors duration-200"
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
                          ? 'bg-[var(--accent)] text-white'
                          : 'bg-[var(--accent-subtle)] text-[var(--ds-text-2)]',
                      )}
                    >
                      {i + 1}
                    </button>
                  ))}
                  <button
                    onClick={addQuestion}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-xs border-2 border-dashed border-[var(--accent-ring)] text-[var(--accent)] flex-shrink-0"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Question editor */}
                {activeQ && (
                  <Card className="flex-1 border-[var(--accent-ring)]/60 shadow-md">
                    <CardContent className="p-5 sm:p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <Badge className="bg-[var(--accent-subtle)] text-[var(--ds-text-1)] border-[var(--accent-ring)]">
                          Question {activeQIndex + 1}
                        </Badge>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => duplicateQuestion(activeQIndex)}
                            title="Duplicate"
                            className="text-[var(--accent)] hover:text-[var(--ds-text-1)] hover:bg-[var(--accent-subtle)]"
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
                        <p className="block text-sm font-semibold text-[var(--ds-text-1)] mb-2">Type</p>
                        <div className="flex gap-2 flex-wrap">
                          {([
                            { type: 'MCQ', label: 'Multiple Choice', icon: CircleDot },
                            { type: 'TRUE_FALSE', label: 'True / False', icon: CheckCircle },
                            { type: 'MULTI_SELECT', label: 'Multi-Select', icon: ListChecks },
                            { type: 'SHORT_ANSWER', label: 'Short Answer', icon: Type },
                            { type: 'OPEN_ENDED', label: 'Open Ended', icon: MessageSquare },
                            { type: 'POLL', label: 'Poll', icon: BarChart3 },
                            { type: 'RATING', label: 'Rating', icon: Star },
                          ] as const).map(({ type, label, icon: Icon }) => (
                            <button
                              key={type}
                              onClick={() => {
                                const previousSingleCorrect =
                                  activeQ.questionType === 'MULTI_SELECT'
                                    ? activeQ.correctAnswers[0] || ''
                                    : activeQ.correctAnswer;
                                const baseOptions = usesOptions(type)
                                  ? (activeQ.options.length >= 2 ? activeQ.options : ['', '', '', ''])
                                  : type === 'TRUE_FALSE'
                                    ? ['True', 'False']
                                    : [];

                                updateQuestion(activeQIndex, {
                                  questionType: type,
                                  options: baseOptions,
                                  correctAnswer:
                                    type === 'MCQ' || type === 'TRUE_FALSE' || type === 'SHORT_ANSWER'
                                      ? previousSingleCorrect
                                      : '',
                                  correctAnswers:
                                    type === 'MULTI_SELECT'
                                      ? (activeQ.questionType === 'MULTI_SELECT'
                                          ? activeQ.correctAnswers
                                          : previousSingleCorrect
                                            ? [previousSingleCorrect]
                                            : [])
                                      : [],
                                });
                              }}
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm transition-all duration-200',
                                activeQ.questionType === type
                                  ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--ds-text-1)] font-semibold shadow-sm'
                                  : 'border-[var(--accent-ring)] hover:bg-[var(--accent-subtle)] text-[var(--ds-text-2)]/60',
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
                        <label htmlFor={`admin-quiz-question-text-${activeQ.id}`} className="block text-sm font-semibold text-[var(--ds-text-1)] mb-1.5">Question *</label>
                        <textarea
                          id={`admin-quiz-question-text-${activeQ.id}`}
                          value={activeQ.questionText}
                          onChange={(e) => updateQuestion(activeQIndex, { questionText: e.target.value })}
                          placeholder="Enter question text..."
                          rows={3}
                          className="w-full rounded-lg border-2 border-[var(--accent-ring)] px-3 py-2 text-sm focus:outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 transition-colors duration-200"
                        />
                      </div>

                      {/* Options (MCQ / POLL / MULTI_SELECT) */}
                      {usesOptions(activeQ.questionType) && (
                        <div>
                          <p className="block text-sm font-semibold text-[var(--ds-text-1)] mb-2">
                            Options
                            {activeQ.questionType === 'MCQ' && (
                              <span className="font-normal text-[var(--accent)]/60 text-xs ml-1">— click the circle to mark the correct answer</span>
                            )}
                            {activeQ.questionType === 'MULTI_SELECT' && (
                              <span className="font-normal text-[var(--accent)]/60 text-xs ml-1">— click the circles to mark every correct answer</span>
                            )}
                          </p>
                          <div className="space-y-2">
                            {activeQ.options.map((opt, oi) => (
                              <div key={oi} className="flex items-center gap-2">
                                {(activeQ.questionType === 'MCQ' || activeQ.questionType === 'MULTI_SELECT') && (
                                  <button
                                    onClick={() => {
                                      if (!opt.trim()) return;
                                      if (activeQ.questionType === 'MCQ') {
                                        updateQuestion(activeQIndex, { correctAnswer: opt });
                                        return;
                                      }

                                      const alreadySelected = activeQ.correctAnswers.includes(opt);
                                      updateQuestion(activeQIndex, {
                                        correctAnswers: alreadySelected
                                          ? activeQ.correctAnswers.filter((answer) => answer !== opt)
                                          : [...activeQ.correctAnswers, opt],
                                      });
                                    }}
                                    className={cn(
                                      'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all duration-200',
                                      opt && (
                                        activeQ.questionType === 'MCQ'
                                          ? activeQ.correctAnswer === opt
                                          : activeQ.correctAnswers.includes(opt)
                                      )
                                        ? 'border-green-500 bg-green-500 text-white scale-110'
                                        : 'border-[var(--accent-ring)] hover:border-[var(--accent)]',
                                    )}
                                    title={activeQ.questionType === 'MCQ' ? 'Mark as correct' : 'Toggle correct answer'}
                                  >
                                    {opt && (
                                      activeQ.questionType === 'MCQ'
                                        ? activeQ.correctAnswer === opt
                                        : activeQ.correctAnswers.includes(opt)
                                    ) && (
                                      <Check className="h-3.5 w-3.5" />
                                    )}
                                  </button>
                                )}
                                <Input
                                  value={opt}
                                  onChange={(e) => {
                                    const nextValue = e.target.value;
                                    const previousValue = activeQ.options[oi];
                                    const newOpts = [...activeQ.options];
                                    newOpts[oi] = nextValue;

                                    const patch: Partial<QuestionDraft> = { options: newOpts };
                                    if (activeQ.questionType === 'MCQ' && activeQ.correctAnswer === previousValue) {
                                      patch.correctAnswer = nextValue;
                                    }
                                    if (activeQ.questionType === 'MULTI_SELECT' && activeQ.correctAnswers.includes(previousValue)) {
                                      patch.correctAnswers = activeQ.correctAnswers.map((answer) =>
                                        answer === previousValue ? nextValue : answer,
                                      );
                                    }

                                    updateQuestion(activeQIndex, patch);
                                  }}
                                  placeholder={`Option ${oi + 1}`}
                                  className="flex-1 border-[var(--accent-ring)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20"
                                />
                                {activeQ.options.length > 2 && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      const removedOption = activeQ.options[oi];
                                      const newOpts = activeQ.options.filter((_, idx) => idx !== oi);
                                      updateQuestion(activeQIndex, {
                                        options: newOpts,
                                        ...(activeQ.questionType === 'MCQ' && activeQ.correctAnswer === removedOption
                                          ? { correctAnswer: '' }
                                          : {}),
                                        ...(activeQ.questionType === 'MULTI_SELECT'
                                          ? { correctAnswers: activeQ.correctAnswers.filter((answer) => answer !== removedOption) }
                                          : {}),
                                      });
                                    }}
                                    className="text-[var(--accent)] hover:text-red-500 hover:bg-red-50"
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
                                className="w-full py-2 rounded-lg border-2 border-dashed border-[var(--accent-ring)] text-[var(--accent)] text-sm font-medium flex items-center justify-center gap-1.5 hover:bg-[var(--accent-subtle)] hover:border-[var(--accent-ring)] transition-colors duration-200"
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
                          <p className="block text-sm font-semibold text-[var(--ds-text-1)] mb-2">Correct Answer *</p>
                          <div className="flex gap-3">
                            {['True', 'False'].map((val) => (
                              <button
                                key={val}
                                onClick={() => updateQuestion(activeQIndex, { correctAnswer: val })}
                                className={cn(
                                  'flex-1 px-6 py-3 rounded-xl border-2 font-semibold transition-all duration-200',
                                  activeQ.correctAnswer === val
                                    ? 'border-green-500 bg-green-50 text-green-700 shadow-sm'
                                    : 'border-[var(--accent-ring)] hover:bg-[var(--accent-subtle)] text-[var(--ds-text-2)]/60',
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
                          <label htmlFor={`admin-quiz-question-answer-${activeQ.id}`} className="block text-sm font-semibold text-[var(--ds-text-1)] mb-1.5">
                            Correct Answer * <span className="font-normal text-[var(--accent)]/40 text-xs">(case-insensitive match)</span>
                          </label>
                          <Input
                            id={`admin-quiz-question-answer-${activeQ.id}`}
                            value={activeQ.correctAnswer}
                            onChange={(e) => updateQuestion(activeQIndex, { correctAnswer: e.target.value })}
                            placeholder="Expected answer..."
                            className="border-[var(--accent-ring)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20"
                          />
                        </div>
                      )}

                      {/* Multi-select preview */}
                      {activeQ.questionType === 'MULTI_SELECT' && (
                        <Card className="border-[var(--accent-ring)]/60 bg-[var(--accent-subtle)]/50">
                          <CardContent className="p-4">
                            <p className="text-sm text-[var(--ds-text-1)] font-semibold">Participants can select multiple answers before submitting.</p>
                            <p className="text-xs text-[var(--accent)]/60 mt-1">
                              Fully correct selections earn full points. Partial selections earn proportional credit only when no wrong option is selected.
                            </p>
                          </CardContent>
                        </Card>
                      )}

                      {/* Open-ended preview */}
                      {activeQ.questionType === 'OPEN_ENDED' && (
                        <Card className="border-[var(--accent-ring)]/60 bg-[var(--accent-subtle)]/50">
                          <CardContent className="p-4 space-y-3">
                            <p className="text-sm text-[var(--ds-text-1)] font-semibold">Participants will type a free-text response. Nothing is right or wrong.</p>
                            <div className="rounded-lg border border-dashed border-[var(--accent-ring)] bg-white px-3 py-3 text-sm text-[var(--accent)]/60">
                              Feedback textarea preview
                            </div>
                            <p className="text-xs text-[var(--accent)]/50">Ideal for session reflections, suggestions, and qualitative feedback.</p>
                          </CardContent>
                        </Card>
                      )}

                      {/* Rating preview */}
                      {activeQ.questionType === 'RATING' && (
                        <Card className="border-[var(--accent-ring)]/60 bg-[var(--accent-subtle)]/50">
                          <CardContent className="p-4 text-center">
                            <p className="text-sm text-[var(--ds-text-1)] mb-2 font-semibold">Preview: 1–5 Star Rating</p>
                            <div className="flex justify-center gap-1">
                              {[1, 2, 3, 4, 5].map((s) => (
                                <span key={s} className="text-2xl text-[var(--accent)]">★</span>
                              ))}
                            </div>
                            <p className="text-xs text-[var(--accent)]/50 mt-2">No correct answer — responses are collected as feedback</p>
                          </CardContent>
                        </Card>
                      )}

                      {/* Settings row */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor={`admin-quiz-time-limit-${activeQ.id}`} className="block text-sm font-semibold text-[var(--ds-text-1)] mb-1.5">
                            Time Limit (seconds)
                          </label>
                          <Input
                            id={`admin-quiz-time-limit-${activeQ.id}`}
                            type="number"
                            min={5}
                            max={120}
                            value={activeQ.timeLimitSeconds}
                            onChange={(e) =>
                              updateQuestion(activeQIndex, {
                                timeLimitSeconds: Math.max(5, Math.min(120, parseInt(e.target.value) || 20)),
                              })
                            }
                            className="border-[var(--accent-ring)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20 font-mono"
                          />
                        </div>
                        <div>
                          <label htmlFor={`admin-quiz-points-${activeQ.id}`} className="block text-sm font-semibold text-[var(--ds-text-1)] mb-1.5">Points</label>
                          <Input
                            id={`admin-quiz-points-${activeQ.id}`}
                            type="number"
                            min={10}
                            max={500}
                            value={isUnscoredQuestion(activeQ.questionType) ? 0 : activeQ.points}
                            onChange={(e) =>
                              updateQuestion(activeQIndex, {
                                points: Math.max(10, Math.min(500, parseInt(e.target.value) || 100)),
                              })
                            }
                            disabled={isUnscoredQuestion(activeQ.questionType)}
                            className="border-[var(--accent-ring)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20 font-mono"
                          />
                          {isUnscoredQuestion(activeQ.questionType) && (
                            <p className="mt-1 text-[11px] text-[var(--accent)]/60">This question type does not affect scores or streaks.</p>
                          )}
                        </div>
                      </div>

                      {/* Media URL */}
                      <div>
                        <label htmlFor={`admin-quiz-media-url-${activeQ.id}`} className="block text-sm font-semibold text-[var(--ds-text-1)] mb-1.5">
                          Media URL <span className="font-normal text-[var(--accent)]/40 text-xs">(optional image)</span>
                        </label>
                        <div className="flex gap-2">
                          <Image className="h-5 w-5 text-[var(--accent)] mt-2" />
                          <Input
                            id={`admin-quiz-media-url-${activeQ.id}`}
                            value={activeQ.mediaUrl}
                            onChange={(e) => updateQuestion(activeQIndex, { mediaUrl: e.target.value })}
                            placeholder="https://example.com/image.png"
                            className="flex-1 border-[var(--accent-ring)] focus:border-[var(--accent)] focus:ring-[var(--accent)]/20"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)} className="border-[var(--accent-ring)] text-[var(--ds-text-2)] hover:bg-[var(--accent-subtle)]">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
                <Button
                  onClick={() => setStep(3)}
                  className="bg-gradient-to-r from-[var(--accent)]0 to-[var(--accent-hover)] hover:from-[var(--accent)] hover:to-[var(--accent-hover)] text-white shadow-md active:scale-[0.98] transition-all duration-300"
                >
                  Review Quiz
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <Step3Review
              title={title}
              description={description}
              questions={questions}
              error={error}
              isSubmitting={isSubmitting}
              submitMode={submitMode}
              onBack={() => setStep(2)}
              onSubmit={(mode) => void handleSubmit(mode)}
            />
          )}

          {/* Step 4: Success Screen — full-screen with big PIN, QR, actions */}
          {step === 4 && createdQuiz && (
            <Step4Success
              createdQuiz={createdQuiz}
              title={title}
              joinUrl={joinUrl}
              qrRef={qrRef}
              pinCopied={pinCopied}
              onCopyPin={handleCopyPin}
              onDownloadQR={handleDownloadQR}
            />
          )}
        </AnimatePresence>
      </div>
      </div>
    </Layout>
  );
}
