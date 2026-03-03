/**
 * QuizLobby — Premium waiting room before quiz starts.
 * Matches site design system: amber/orange palette, Card component, consistent typography.
 * Player join animations slide in from bottom. QR with PNG download.
 */

import { memo, useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Users, Loader2, Copy, Check, QrCode, Download, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuizStore } from '@/lib/quizStore';
import { QRCodeSVG } from 'qrcode.react';

export const QuizLobby = memo(function QuizLobby() {
  const players = useQuizStore((s) => s.players);
  const title = useQuizStore((s) => s.title);
  const totalQuestions = useQuizStore((s) => s.totalQuestions);
  const pin = useQuizStore((s) => s.pin);
  const isAdmin = useQuizStore((s) => s.isAdmin);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  const joinUrl = pin
    ? `${window.location.origin}/quiz/join?pin=${pin}`
    : `${window.location.origin}/quiz/join`;

  const handleCopyPin = useCallback(async () => {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedPin(true);
      setTimeout(() => setCopiedPin(false), 2000);
    } catch { /* fallback */ }
  }, [pin]);

  const handleCopyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch { /* fallback */ }
  }, [joinUrl]);

  const handleDownloadQr = useCallback(async () => {
    if (!qrRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(qrRef.current, { backgroundColor: '#ffffff', scale: 2 });
      const link = document.createElement('a');
      link.download = `quiz-pin-${pin}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch { /* fallback */ }
  }, [pin]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="max-w-2xl mx-auto space-y-6"
    >
      {/* Quiz info */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl md:text-4xl font-bold text-amber-900 tracking-tight font-display">{title}</h1>
        <div className="flex justify-center gap-3">
          <Badge variant="secondary">{totalQuestions} Questions</Badge>
          <Badge variant="outline" className="bg-amber-50">
            <Users className="h-3.5 w-3.5 mr-1" />
            {players.length} {players.length === 1 ? 'Player' : 'Players'}
          </Badge>
        </div>
      </div>

      {/* PIN Display — admin only */}
      {isAdmin && pin && (
        <Card className="border-amber-300 overflow-hidden">
          <div className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 p-6 sm:p-8 text-center text-white">
            <p className="text-sm font-medium text-amber-100 mb-2 uppercase tracking-wider">Game PIN</p>
            <div className="flex items-center justify-center gap-3 mb-3">
              <span className="text-5xl sm:text-6xl font-mono font-black tracking-[0.3em] sm:tracking-[0.4em] select-all">
                {pin}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleCopyPin}
                className="text-white hover:bg-white/20 h-10 w-10"
              >
                {copiedPin ? <Check className="h-5 w-5 text-green-200" /> : <Copy className="h-5 w-5" />}
              </Button>
            </div>
            <p className="text-xs text-amber-200">
              Go to <span className="font-mono font-semibold">{window.location.host}/quiz/join</span> and enter this PIN
            </p>
          </div>

          {/* Actions row below gradient */}
          <CardContent className="p-4 flex flex-wrap items-center justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowQr(!showQr)}>
              <QrCode className="h-4 w-4 mr-2" />
              {showQr ? 'Hide QR' : 'Show QR'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopyUrl}>
              <Link2 className="h-4 w-4 mr-2" />
              {copiedUrl ? 'Copied!' : 'Copy Link'}
            </Button>
            {showQr && (
              <Button variant="outline" size="sm" onClick={handleDownloadQr}>
                <Download className="h-4 w-4 mr-2" />
                Download QR
              </Button>
            )}
          </CardContent>

          {/* QR Code expandable */}
          <AnimatePresence>
            {showQr && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="flex justify-center pb-6">
                  <div ref={qrRef} className="bg-white p-4 rounded-xl shadow-md border border-amber-200">
                    <QRCodeSVG
                      value={joinUrl}
                      size={180}
                      level="M"
                      bgColor="#ffffff"
                      fgColor="#000000"
                    />
                    <p className="text-center text-xs text-gray-500 mt-2 font-mono">{pin}</p>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      )}

      {/* Players list */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Users className="h-5 w-5 text-amber-600" />
              Players in Lobby
            </CardTitle>
            <Badge variant="secondary">{players.length}</Badge>
          </div>
        </CardHeader>
        <CardContent>
          {players.length === 0 ? (
            <div className="text-center py-8">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 mb-3">
                <Loader2 className="h-6 w-6 animate-spin text-amber-500" />
              </div>
              <p className="text-gray-500 text-sm">Waiting for players to join...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <AnimatePresence mode="popLayout">
                {players.map((p, i) => (
                  <motion.div
                    key={p.userId}
                    layout
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.2, delay: i * 0.03 }}
                    className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-100 rounded-lg hover:bg-amber-100/70 transition-colors duration-200"
                  >
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex-shrink-0 flex items-center justify-center text-white font-bold text-sm">
                      {p.displayName.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-amber-900 truncate">{p.displayName}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Waiting indicator */}
      {!isAdmin && (
        <div className="text-center py-2">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-50 border border-amber-200">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            <p className="text-sm font-medium text-amber-700">Waiting for the host to start...</p>
          </div>
        </div>
      )}
    </motion.div>
  );
});
