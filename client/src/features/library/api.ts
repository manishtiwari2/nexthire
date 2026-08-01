// Thin typed wrappers over apiClient for the Question Library. apiClient's response
// interceptor already unwraps to the API envelope `{ success, data, pagination }`, so these
// helpers return the `data` payload directly (plus pagination where relevant).

import { apiClient } from '../../api/client';
import type {
  QuestionCard, SheetSummary, SheetDetail, NoteDto, ProgressStats, Collection, ProgressDto
} from './types';

interface Envelope<T> { data: T; pagination?: { total: number; page: number; limit: number; totalPages: number } }

// ---- Library browse (enhanced /questions) ----
export interface LibraryQuery {
  search?: string; difficulty?: string; topicSlug?: string; companySlug?: string;
  source?: string; frequency?: string; status?: string; bookmarked?: string;
  revisionDue?: string; sort?: string; page?: number; limit?: number;
}

export async function fetchLibrary(params: LibraryQuery) {
  const res = (await apiClient.get('/questions', { params })) as Envelope<QuestionCard[]>;
  return { questions: res.data || [], pagination: res.pagination };
}

export async function fetchTopics() {
  const res = (await apiClient.get('/library/collections/topics')) as Envelope<Collection[]>;
  return res.data || [];
}

export async function fetchCompanies() {
  const res = (await apiClient.get('/library/collections/companies')) as Envelope<Collection[]>;
  return res.data || [];
}

export async function fetchSources() {
  const res = (await apiClient.get('/library/collections/sources')) as Envelope<Array<{ platform: string; total: number }>>;
  return res.data || [];
}

// ---- Sheets ----
export async function fetchSheets() {
  const res = (await apiClient.get('/library/sheets')) as Envelope<SheetSummary[]>;
  return res.data || [];
}
export async function fetchSheet(slug: string) {
  const res = (await apiClient.get(`/library/sheets/${slug}`)) as Envelope<SheetDetail>;
  return res.data;
}
export async function createSheet(body: { name: string; description?: string; isPublic?: boolean }) {
  const res = (await apiClient.post('/library/sheets', body)) as Envelope<SheetSummary>;
  return res.data;
}
export async function deleteSheet(id: string) {
  return apiClient.delete(`/library/sheets/${id}`);
}
export async function addSheetItem(id: string, questionId: string, section?: string) {
  return apiClient.post(`/library/sheets/${id}/items`, { questionId, section });
}
export async function removeSheetItem(id: string, questionId: string) {
  return apiClient.delete(`/library/sheets/${id}/items/${questionId}`);
}

// ---- Progress ----
export async function fetchProgressStats() {
  const res = (await apiClient.get('/library/progress/stats')) as Envelope<ProgressStats>;
  return res.data;
}
export async function fetchProgressList(params?: { status?: string; bookmarked?: string }) {
  const res = (await apiClient.get('/library/progress', { params })) as Envelope<Array<{ question: QuestionCard; progress: ProgressDto }>>;
  return res.data || [];
}
export async function setProgressStatus(questionId: string, status: string) {
  const res = (await apiClient.patch(`/library/progress/${questionId}`, { status })) as Envelope<ProgressDto>;
  return res.data;
}
export async function toggleBookmark(questionId: string, bookmarked?: boolean) {
  const res = (await apiClient.post(`/library/progress/${questionId}/bookmark`, { bookmarked })) as Envelope<ProgressDto>;
  return res.data;
}

// ---- Notes (private) ----
export async function fetchNote(questionId: string) {
  const res = (await apiClient.get(`/library/notes/${questionId}`)) as Envelope<NoteDto>;
  return res.data;
}
export async function saveNote(questionId: string, note: Partial<NoteDto>) {
  const res = (await apiClient.put(`/library/notes/${questionId}`, note)) as Envelope<NoteDto>;
  return res.data;
}

// ---- Practice modes ----
export async function fetchDaily() {
  const res = (await apiClient.get('/library/practice/daily')) as Envelope<{ date: string; question: QuestionCard | null } | null>;
  return res.data;
}
export async function fetchRandom(params?: { difficulty?: string; topicSlug?: string; count?: number }) {
  const res = (await apiClient.get('/library/practice/random', { params })) as Envelope<QuestionCard[]>;
  return res.data || [];
}
export async function fetchRevisionQueue() {
  const res = (await apiClient.get('/library/practice/revision-queue')) as Envelope<Array<{ nextReviewAt: string; question: QuestionCard }>>;
  return res.data || [];
}
export async function fetchWeakTopics() {
  const res = (await apiClient.get('/library/practice/weak-topics')) as Envelope<QuestionCard[]>;
  return res.data || [];
}
export async function fetchMixed(count = 5) {
  const res = (await apiClient.get('/library/practice/mixed', { params: { count } })) as Envelope<QuestionCard[]>;
  return res.data || [];
}
export async function startMock(body: { count?: number; difficulty?: string }) {
  const res = (await apiClient.post('/library/practice/mock', body)) as Envelope<{ budgetMin: number; questions: QuestionCard[] }>;
  return res.data;
}
