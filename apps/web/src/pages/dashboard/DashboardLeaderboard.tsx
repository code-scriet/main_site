import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useAuth } from '@/context/AuthContext';
import { useSettings } from '@/context/SettingsContext';
import { Button } from '@/components/ui/button';
import { api, type QOTDLeaderboardEntry } from '@/lib/api';
import { Trophy, Medal, Award, Loader2, Crown, Flame, AlertCircle } from 'lucide-react';

export default function DashboardLeaderboard() {
  const { user } = useAuth();
  const { settings } = useSettings();
  const [leaderboard, setLeaderboard] = useState<QOTDLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLeaderboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const result = await api.getQOTDLeaderboard(50);
      setLeaderboard(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLeaderboard();
  }, [loadLeaderboard]);

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-sm font-bold text-gray-500">#{rank}</span>;
    }
  };

  const getRankBg = (rank: number) => {
    switch (rank) {
      case 1:
        return 'bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200';
      case 2:
        return 'bg-gradient-to-r from-gray-50 to-slate-50 border-gray-200';
      case 3:
        return 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200';
      default:
        return 'bg-white border-amber-100';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-amber-600" />
      </div>
    );
  }

  // Check if leaderboard is disabled in settings
  if (settings?.showLeaderboard === false) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-amber-900">Leaderboard</h1>
          <p className="text-gray-600">Top QOTD participants based on problems solved</p>
        </div>
        <Card>
          <CardContent className="py-12 text-center">
            <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-lg font-medium text-gray-600">Leaderboard is currently disabled</p>
            <p className="text-sm text-gray-500 mt-2">Check back later!</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Find user's rank (1-indexed)
  const userEntryIndex = leaderboard.findIndex(entry => entry.user.id === user?.id);
  const userRank = userEntryIndex >= 0 ? userEntryIndex + 1 : null;
  const userEntry = userEntryIndex >= 0 ? leaderboard[userEntryIndex] : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-amber-900">Leaderboard</h1>
        <p className="text-gray-600">Top QOTD participants based on problems solved</p>
      </div>

      {/* User's Rank Card */}
      {user && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
            <Card className="bg-gradient-to-r from-amber-400 via-orange-500 to-amber-600 text-white border-none">
              <CardContent className="p-4 sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="h-14 w-14 rounded-full overflow-hidden ring-4 ring-white/30 bg-white/20">
                    {user.avatar ? (
                      <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-xl font-bold">
                        {user.name?.charAt(0)}
                      </div>
                    )}
                  </div>
                    <div className="min-w-0">
                      <p className="text-amber-100 text-sm">Your Ranking</p>
                      <p className="text-xl sm:text-2xl font-bold break-words">{user.name}</p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="flex items-center gap-2 justify-end">
                      <Trophy className="h-6 w-6" />
                    <span className="text-3xl font-bold">
                      {userRank ? `#${userRank}` : 'Unranked'}
                    </span>
                  </div>
                    <div className="flex items-center gap-1 sm:justify-end mt-1">
                      <Flame className="h-4 w-4" />
                    <span className="text-amber-100">
                      {userEntry ? `${userEntry.submissions} problems solved` : 'Complete QOTD to get ranked!'}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-600" />
            Top Performers
          </CardTitle>
          <CardDescription>
            {leaderboard.length} participants ranked by QOTD completion
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="text-center py-8">
              <AlertCircle className="h-10 w-10 text-red-400 mx-auto mb-3" />
              <p className="text-red-600 font-medium">{error}</p>
              <Button variant="outline" className="mt-4" onClick={() => void loadLeaderboard()}>
                Try Again
              </Button>
            </div>
          ) : leaderboard.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Trophy className="h-16 w-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No rankings yet!</p>
              <p className="text-sm">Complete QOTD problems to appear on the leaderboard.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, index) => {
                const rank = index + 1;
                return (
                  <motion.div
                    key={entry.user.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.05, 0.3) }}
                    className={`flex items-center justify-between gap-3 p-4 rounded-lg border ${getRankBg(rank)} ${
                      entry.user.id === user?.id ? 'ring-2 ring-amber-500' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                      <div className="w-8 flex justify-center">
                        {getRankIcon(rank)}
                      </div>
                      <div className="h-10 w-10 rounded-full overflow-hidden bg-amber-200 flex-shrink-0">
                        {entry.user.avatar ? (
                          <img src={entry.user.avatar} alt={entry.user.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-amber-700 font-bold">
                            {entry.user.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-amber-900 break-words">
                          {entry.user.name}
                          {entry.user.id === user?.id && (
                            <span className="ml-2 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                              You
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Flame className="h-4 w-4 text-orange-500" />
                      <span className="font-bold text-amber-900">{entry.submissions}</span>
                      <span className="text-sm text-gray-500">problems</span>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
