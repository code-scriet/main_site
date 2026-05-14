import { Card, CardContent } from '@/components/ui/card';

export interface HeatmapGridQuestion {
  id: string;
  position: number;
  timeLimitSeconds: number;
}

export interface HeatmapGridPlayer {
  userId: string;
  displayName: string;
}

export interface HeatmapGridAnswer {
  userId: string;
  questionId: string;
  isCorrect: boolean | null;
  answerTimeMs: number;
}

interface HeatmapGridProps {
  participantAnswers: HeatmapGridAnswer[];
  leaderboard: HeatmapGridPlayer[];
  questionAnalytics: HeatmapGridQuestion[];
}

export function HeatmapGrid({
  participantAnswers,
  leaderboard,
  questionAnalytics,
}: HeatmapGridProps) {
  const topPlayers = leaderboard.slice(0, 20);
  const sortedQuestions = [...questionAnalytics].sort((a, b) => a.position - b.position);

  const answerMap = new Map<string, { isCorrect: boolean | null; answerTimeMs: number }>();
  participantAnswers.forEach(a => {
    answerMap.set(`${a.userId}::${a.questionId}`, { isCorrect: a.isCorrect, answerTimeMs: a.answerTimeMs });
  });

  function getCellColor(userId: string, questionId: string, timeLimitSeconds: number): string {
    const record = answerMap.get(`${userId}::${questionId}`);
    if (!record) return '#e5e7eb';
    if (record.isCorrect === null) return '#fde68a';
    if (!record.isCorrect) return '#fca5a5';
    const timeRatio = record.answerTimeMs / (timeLimitSeconds * 1000);
    if (timeRatio <= 0.4) return '#059669';
    if (timeRatio <= 0.7) return '#34d399';
    return '#a7f3d0';
  }

  function getCellTitle(userId: string, questionId: string): string {
    const record = answerMap.get(`${userId}::${questionId}`);
    if (!record) return 'No answer submitted';
    if (record.isCorrect === null) return `Responded in ${(record.answerTimeMs / 1000).toFixed(1)}s`;
    return `${record.isCorrect ? '✓ Correct' : '✗ Wrong'} — ${(record.answerTimeMs / 1000).toFixed(1)}s`;
  }

  if (topPlayers.length === 0 || sortedQuestions.length === 0) return null;

  return (
    <Card className="border-amber-200/60 shadow-sm mt-6">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-bold text-amber-900 font-display">Performance Heatmap</h3>
          <div className="flex items-center gap-3 text-[10px] text-amber-700/70 flex-wrap">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#059669' }} /> Fast correct
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#a7f3d0' }} /> Slow correct
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#fca5a5' }} /> Wrong
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: '#e5e7eb' }} /> No answer
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse" style={{ minWidth: sortedQuestions.length * 32 + 140 }}>
            <thead>
              <tr>
                <th className="text-left text-amber-800/60 font-medium pr-3 pb-1" style={{ width: 140, minWidth: 140 }}>Player</th>
                {sortedQuestions.map((q, i) => (
                  <th key={q.id} className="text-center text-amber-800/60 font-medium pb-1" style={{ width: 28, minWidth: 28 }} title={`Question ${i + 1}`}>
                    Q{i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPlayers.map((player, rowIdx) => (
                <tr key={player.userId}>
                  <td className="pr-3 py-0.5 text-amber-900 font-medium truncate" style={{ maxWidth: 140 }} title={player.displayName}>
                    <span className="text-amber-500/60 mr-1">#{rowIdx + 1}</span>
                    {player.displayName}
                  </td>
                  {sortedQuestions.map(q => (
                    <td key={q.id} className="py-0.5 px-0.5" title={getCellTitle(player.userId, q.id)}>
                      <div
                        style={{
                          width: 22, height: 22, borderRadius: 3,
                          backgroundColor: getCellColor(player.userId, q.id, q.timeLimitSeconds),
                          margin: '0 auto',
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-amber-700/40 mt-2">
          Showing top {Math.min(topPlayers.length, 20)} players by score. Hover cells for details.
        </p>
      </CardContent>
    </Card>
  );
}
