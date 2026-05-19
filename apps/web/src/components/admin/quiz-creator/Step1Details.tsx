import { motion } from 'framer-motion';
import { ArrowRight, Download, Loader2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

interface Step1DetailsProps {
  title: string;
  onTitleChange: (value: string) => void;
  description: string;
  onDescriptionChange: (value: string) => void;
  importFile: File | null;
  onImportFileChange: (file: File | null) => void;
  importing: boolean;
  importError: string;
  onImportFileError: (message: string) => void;
  onImportQuestions: () => void;
  onDownloadTemplate: () => void;
  onNext: () => void;
}

export function Step1Details({
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  importFile,
  onImportFileChange,
  importing,
  importError,
  onImportFileError,
  onImportQuestions,
  onDownloadTemplate,
  onNext,
}: Step1DetailsProps) {
  return (
    <motion.div
      key="step1"
      initial={{ opacity: 0, x: 50 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -50 }}
      className="space-y-6"
    >
      <h2 className="text-2xl font-bold text-[var(--ds-text-1)] font-display">Quiz Details</h2>
      <Card className="border-[var(--warning-border)]/60 shadow-md">
        <CardContent className="p-6 space-y-4">
          <div>
            <label htmlFor="admin-quiz-title" className="block text-sm font-semibold text-[var(--warning)] mb-1.5">Title *</label>
            <Input
              id="admin-quiz-title"
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="e.g. JavaScript Fundamentals Quiz"
              className="text-lg border-[var(--warning-border)] focus:border-amber-400 focus:ring-amber-400/20"
            />
          </div>
          <div>
            <label htmlFor="admin-quiz-description" className="block text-sm font-semibold text-[var(--warning)] mb-1.5">Description</label>
            <textarea
              id="admin-quiz-description"
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Optional description..."
              rows={3}
              className="w-full rounded-lg border-2 border-[var(--warning-border)] px-3 py-2 text-sm focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20 transition-colors duration-200"
            />
          </div>
          <div className="rounded-lg border border-dashed border-[var(--warning-border)] bg-[var(--warning-bg)]/60 p-4 space-y-3">
            <p className="text-sm font-semibold text-[var(--warning)]">Import from CSV/XLSX</p>
            <p className="text-xs text-[var(--warning)]/70">
              Headers: <span className="font-mono">questionText</span> (required), optional
              {' '}<span className="font-mono">questionType</span>, <span className="font-mono">option1..option6</span>,
              {' '}<span className="font-mono">correctAnswer</span>, <span className="font-mono">timeLimitSeconds</span>,
              {' '}<span className="font-mono">points</span>, <span className="font-mono">mediaUrl</span>.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                type="file"
                accept=".csv,.xlsx"
                onChange={(event) => {
                  onImportFileChange(event.target.files?.[0] || null);
                  onImportFileError('');
                }}
                className="border-[var(--warning-border)] focus:border-amber-400 focus:ring-amber-400/20"
              />
              <Button
                type="button"
                variant="outline"
                onClick={onImportQuestions}
                disabled={!importFile || importing}
                className="border-[var(--warning-border)] text-[var(--warning)] hover:bg-[var(--warning-bg)]"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Import Questions
                  </>
                )}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onDownloadTemplate}
                className="border-[var(--warning-border)] text-[var(--warning)] hover:bg-[var(--warning-bg)]"
              >
                <Download className="h-4 w-4 mr-2" />
                Download Template
              </Button>
            </div>
            {importError && (
              <p className="text-xs text-red-600 font-medium">{importError}</p>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button
          onClick={onNext}
          disabled={!title.trim()}
          className="bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-md active:scale-[0.98] transition-all duration-300"
        >
          Next: Add Questions
          <ArrowRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}
