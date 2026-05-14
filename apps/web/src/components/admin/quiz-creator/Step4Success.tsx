import { type RefObject } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { ArrowLeft, Check, Copy, Download, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Step4SuccessProps {
  createdQuiz: { id: string; pin: string | null; status: 'DRAFT' | 'WAITING' };
  title: string;
  joinUrl: string;
  qrRef: RefObject<HTMLDivElement | null>;
  pinCopied: boolean;
  onCopyPin: () => void;
  onDownloadQR: () => void;
}

export function Step4Success({
  createdQuiz,
  title,
  joinUrl,
  qrRef,
  pinCopied,
  onCopyPin,
  onDownloadQR,
}: Step4SuccessProps) {
  return (
    <motion.div
      key="step4"
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className="flex flex-col items-center gap-6 py-8"
    >
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
        <h2 className="text-2xl sm:text-3xl font-bold text-amber-900 font-display">
          {createdQuiz.status === 'WAITING' ? 'Quiz Opened!' : 'Draft Saved!'}
        </h2>
        <p className="text-amber-700/60 mt-1">
          {createdQuiz.status === 'WAITING'
            ? `"${title}" is live. Share the PIN to get started.`
            : `"${title}" is saved as a draft. Open it from Quiz Manager when you're ready.`}
        </p>
      </motion.div>

      {createdQuiz.status === 'WAITING' && createdQuiz.pin && (
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
                onClick={onCopyPin}
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
      )}

      {createdQuiz.status === 'WAITING' && createdQuiz.pin && (
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
                onClick={onDownloadQR}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Download QR
              </button>
            </CardContent>
          </Card>
        </motion.div>
      )}

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
          <Link to={createdQuiz.status === 'WAITING' ? `/quiz/${createdQuiz.id}` : '/dashboard/quiz'}>
            <ExternalLink className="h-5 w-5 mr-2" />
            {createdQuiz.status === 'WAITING' ? 'Go to Lobby' : 'Go to Quiz Manager'}
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
  );
}
