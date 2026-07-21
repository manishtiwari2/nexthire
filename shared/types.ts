export type Role = 'ADMIN' | 'CANDIDATE';

export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

export type SubmissionStatus = 
  | 'ACCEPTED' 
  | 'WRONG_ANSWER' 
  | 'TIME_LIMIT_EXCEEDED' 
  | 'COMPILATION_ERROR';

export type ContestStatus = 'UPCOMING' | 'LIVE' | 'ENDED';

export type InterviewStatus = 'SCHEDULED' | 'WAITING_ROOM' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  avatarUrl?: string;
  isVerified: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Profile {
  id: string;
  userId: string;
  bio?: string;
  githubUrl?: string;
  linkedinUrl?: string;
  rank: number;
  streak: number;
  skills?: string;
}

export interface Question {
  id: string;
  title: string;
  slug: string;
  difficulty: Difficulty;
  category: string;
  description: string;
  constraints?: string;
  starterCode: string; // JSON string mapping lang -> code
  testCases: string;   // JSON string of input/output test cases
  acceptanceRate: number;
  createdAt: string;
}

export interface Contest {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  status: ContestStatus;
  problems: string[]; // array of question IDs
  participantCount?: number;
}

export interface Interview {
  id: string;
  roomCode: string;
  candidateId: string;
  candidateName?: string;
  candidateAvatar?: string;
  interviewerId: string;
  interviewerName?: string;
  position: string;
  scheduledAt: string;
  status: InterviewStatus;
  problemId?: string;
  problemTitle?: string;
  reportId?: string;
}

export interface Submission {
  id: string;
  userId: string;
  userName?: string;
  questionId: string;
  questionTitle?: string;
  contestId?: string;
  code: string;
  language: string;
  status: SubmissionStatus;
  executionTime?: number;
  memoryUsed?: number;
  passCount: number;
  totalTestCases: number;
  createdAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'SYSTEM' | 'CONTEST' | 'INTERVIEW';
  isRead: boolean;
  createdAt: string;
}

export interface InterviewReport {
  id: string;
  interviewId: string;
  overallScore: number;
  rubricScores: {
    problemSolving: number;
    codeQuality: number;
    communication: number;
    systemDesign: number;
  };
  feedback: string;
  strengths: string;
  improvements: string;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  user: User;
}

export interface ApiResponse<T = any> {
  success: boolean;
  message?: string;
  data?: T;
  error?: string;
}

export interface CodeExecutionResult {
  status: SubmissionStatus;
  output: string;
  error?: string;
  executionTime: number;
  memoryUsed: number;
  passCount: number;
  totalTestCases: number;
}
