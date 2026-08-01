// Shared types for the Question Library frontend.

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';
export type ProgressStatus = 'TODO' | 'ATTEMPTED' | 'SOLVED';
export type FrequencyBand = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
export type SourcePlatform =
  | 'LEETCODE' | 'GEEKSFORGEEKS' | 'HACKERRANK' | 'CODEFORCES'
  | 'CODECHEF' | 'ATCODER' | 'INTERVIEWBIT' | 'CUSTOM';

export interface ProgressDto {
  status: ProgressStatus;
  attempts: number;
  acceptedCount: number;
  isBookmarked: boolean;
  firstSolvedAt?: string | null;
  lastPracticedAt?: string | null;
  avgSolveSec?: number | null;
}

export interface QuestionCard {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  subtopics?: string[];
  frequencyBand?: FrequencyBand | null;
  frequencyScore?: number | null;
  estimatedTimeMin?: number | null;
  sourcePlatform?: SourcePlatform;
  sourceUrl?: string | null;
  acceptanceRate?: number | null;
  isExternalOnly?: boolean;
  topic?: { id: string; name: string; slug: string } | null;
  companies?: string[];
  progress?: ProgressDto;
}

export interface SheetSummary {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  kind: 'SYSTEM' | 'CUSTOM';
  ownerId?: string | null;
  isPublic?: boolean;
  total: number;
  solvedCount: number;
  canEdit?: boolean;
}

export interface SheetItem {
  questionId: string;
  section?: string | null;
  orderIndex: number;
  question: QuestionCard;
  progress: ProgressDto;
}

export interface SheetDetail extends SheetSummary {
  items: SheetItem[];
}

export interface NoteDto {
  questionId: string;
  approach?: string | null;
  mistakes?: string | null;
  edgeCases?: string | null;
  timeComplexity?: string | null;
  spaceComplexity?: string | null;
  keyInsights?: string | null;
  revisionNotes?: string | null;
}

export interface ProgressStats {
  totalQuestions: number;
  solvedTotal: number;
  attemptedTotal: number;
  bookmarkedTotal: number;
  byDifficulty: Record<Difficulty, number>;
  totalByDifficulty: Record<Difficulty, number>;
  weakTopics: Array<{ id: string; name: string; slug: string; seen: number; solved: number; solveRate: number; unsolved: number }>;
  avgSolveSec: number | null;
  revisionDue: number;
  recent: Array<{ questionId: string; status: ProgressStatus; lastPracticedAt: string }>;
}

export interface ActivityStats {
  calendar: Record<string, number>;
  currentStreak: number;
  longestStreak: number;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  totalActiveDays: number;
  totalSubmissions: number;
  windowDays: number;
}

export interface Collection {
  id: string;
  name: string;
  slug: string;
  total: number;
  solvedCount: number;
}
