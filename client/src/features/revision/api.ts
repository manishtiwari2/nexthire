// Typed wrappers for the spaced-repetition revision system. apiClient already unwraps to the
// API envelope, so these return the `data` payload directly.

import { apiClient } from '../../api/client';
import type { QuestionCard } from '../library/types';

export interface RevisionItem {
  questionId: string;
  nextReviewAt: string;
  intervalDays: number;
  easeFactor: number;
  reviewCount: number;
  lastReviewedAt: string;
  question: QuestionCard;
}

export interface RevisionStats {
  totalTracked: number;
  dueCount: number;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  avgEase: number;
  confidence: number;
}

export interface RevisionQueue {
  overdue: RevisionItem[];
  dueToday: RevisionItem[];
  upcoming: RevisionItem[];
  stats: RevisionStats;
}

interface Envelope<T> { data: T }

export async function fetchRevisionState() {
  const res = (await apiClient.get('/revision/queue')) as Envelope<RevisionQueue>;
  return res.data;
}

export async function gradeReview(questionId: string, quality: number) {
  const res = (await apiClient.post('/revision/review', { questionId, quality })) as Envelope<any>;
  return res.data;
}

export async function enqueueRevision(questionId: string, dueInDays = 1) {
  const res = (await apiClient.post('/revision/enqueue', { questionId, dueInDays })) as Envelope<any>;
  return res.data;
}

export async function removeRevision(questionId: string) {
  return apiClient.delete(`/revision/${questionId}`);
}
