import { motion } from 'framer-motion';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  QUESTION_TYPE_LABELS,
  isUnscoredQuestion,
  type QuestionDraft,
} from '@/lib/quizDrafts';

interface Step3ReviewProps {
  title: string;
  description: string;
  questions: QuestionDraft[];
  error: string;
  isSubmitting: boolean;
  submitMode: 'draft' | 'open';
  onBack: () => void;
  onSubmit: (mode: 'draft' | 'open') => void;
}

export function Step3Review({
  title,
  description,
  questions,
  error,
  isSubmitting,
  submitMode,
  onBack,
  onSubmit,
}: Step3ReviewProps) {
  const totalSeconds = questions.reduce((s, q) => s + q.timeLimitSeconds, 0);
  const totalPoints = questions.reduce(
    (sum, question) => sum + (isUnscoredQuestion(question.questionType) ? 0 : question.points),
    0,
  );

  return (
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
              ~{totalSeconds}s total
            </Badge>
            <Badge variant="outline" className="border-amber-300 text-amber-700 font-mono text-xs">
              {totalPoints} pts max
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
                    {QUESTION_TYPE_LABELS[q.questionType]}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 px-1.5 py-0 font-mono">
                    {q.timeLimitSeconds}s
                  </Badge>
                  <Badge variant="outline" className="text-[10px] border-amber-200 text-amber-600 px-1.5 py-0 font-mono">
                    {isUnscoredQuestion(q.questionType) ? '0pts' : `${q.points}pts`}
                  </Badge>
                  {q.questionType === 'MULTI_SELECT' && q.correctAnswers.length > 0 && (
                    <Badge className="text-[10px] bg-green-100 text-green-700 border-green-300 px-1.5 py-0">
                      ✓ {q.correctAnswers.join(', ')}
                    </Badge>
                  )}
                  {!isUnscoredQuestion(q.questionType) && q.questionType !== 'MULTI_SELECT' && q.correctAnswer && (
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
        <Button variant="outline" onClick={onBack} className="border-amber-300 text-amber-700 hover:bg-amber-50">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Edit Questions
        </Button>
        <div className="flex flex-col sm:flex-row gap-2">
          <Button
            onClick={() => onSubmit('draft')}
            disabled={isSubmitting}
            variant="outline"
            className="border-amber-300 text-amber-700 hover:bg-amber-50"
            size="lg"
          >
            {isSubmitting && submitMode === 'draft' ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Save Draft
              </>
            )}
          </Button>
          <Button
            onClick={() => onSubmit('open')}
            disabled={isSubmitting}
            className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
            size="lg"
          >
            {isSubmitting && submitMode === 'open' ? (
              <>
                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                Opening...
              </>
            ) : (
              <>
                <Save className="h-5 w-5 mr-2" />
                Save &amp; Open Now
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
