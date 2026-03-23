export const PENDING_QUIZ_JOIN_KEY = 'pendingQuizJoin';
const QUIZ_ACCESS_TOKEN_KEY_PREFIX = 'quiz_access_token_';

export interface PendingQuizJoin {
  quizId: string;
  quizAccessToken: string;
}

function getSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function getQuizAccessTokenStorageKey(quizId: string) {
  return `${QUIZ_ACCESS_TOKEN_KEY_PREFIX}${quizId}`;
}

export function persistQuizAccessToken(quizId: string, quizAccessToken: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(getQuizAccessTokenStorageKey(quizId), quizAccessToken);
}

export function readQuizAccessToken(quizId: string): string | null {
  const storage = getSessionStorage();
  if (!storage) return null;
  return storage.getItem(getQuizAccessTokenStorageKey(quizId));
}

export function clearQuizAccessToken(quizId: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(getQuizAccessTokenStorageKey(quizId));
}

export function storePendingQuizJoin(pendingQuizJoin: PendingQuizJoin) {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.setItem(PENDING_QUIZ_JOIN_KEY, JSON.stringify(pendingQuizJoin));
}

export function readPendingQuizJoin(): PendingQuizJoin | null {
  const storage = getSessionStorage();
  if (!storage) return null;

  const raw = storage.getItem(PENDING_QUIZ_JOIN_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingQuizJoin>;
    if (typeof parsed.quizId === 'string' && typeof parsed.quizAccessToken === 'string') {
      return {
        quizId: parsed.quizId,
        quizAccessToken: parsed.quizAccessToken,
      };
    }
  } catch {
    storage.removeItem(PENDING_QUIZ_JOIN_KEY);
  }

  return null;
}

export function clearPendingQuizJoin() {
  const storage = getSessionStorage();
  if (!storage) return;
  storage.removeItem(PENDING_QUIZ_JOIN_KEY);
}

export function restorePendingQuizJoin(quizId: string): string | null {
  const pendingQuizJoin = readPendingQuizJoin();
  if (!pendingQuizJoin || pendingQuizJoin.quizId !== quizId) {
    return null;
  }

  persistQuizAccessToken(quizId, pendingQuizJoin.quizAccessToken);
  clearPendingQuizJoin();

  return pendingQuizJoin.quizAccessToken;
}
