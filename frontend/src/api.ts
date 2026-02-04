export type UserRole = 'teacher' | 'student' | 'parent' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface LoginResponse {
  token: string;
  user: User;
  demoInfo?: {
    password: string;
    exampleAdminEmail?: string;
    exampleTeacherEmail?: string;
    exampleStudentEmail?: string;
    exampleParentEmail?: string;
  };
}

export interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
  gradeLevel?: string;
  className?: string;
  testsSolvedLast7Days?: number;
  averageScorePercent?: number;
  totalStudyMinutes?: number;
  status?: 'active' | 'inactive';
  pendingAssignmentsCount?: number;
  overdueAssignmentsCount?: number;
}

export interface ParentDashboardSummary {
  children: ParentDashboardSummaryStudentCard[];
  overallStats: {
    totalChildren: number;
    totalTestsSolved: number;
    averageScoreAcrossAll: number;
  };
}

export interface StudentDetailSummary {
  studentId: string;
  studentName: string;
  gradeLevel?: string;
  className?: string;
  quickStats: {
    testsSolvedLast7Days: number;
    averageScorePercent: number;
    totalStudyMinutes: number;
    pendingAssignmentsCount: number;
    overdueAssignmentsCount: number;
  };
  recentActivities: Array<{
    type: 'test' | 'content';
    title: string;
    date: string;
  }>;
  upcomingAssignments: Array<{
    assignmentId: string;
    title: string;
    description?: string;
    type: 'test' | 'content' | 'mixed';
    subjectName: string;
    topic: string;
    dueDate: string;
    status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  }>;
}

export interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  studentId?: string;
  subject?: string;
  text: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}

export interface Conversation {
  userId: string;
  userName: string;
  userRole: string;
  studentId?: string;
  studentName?: string;
  lastMessage?: Message;
  unreadCount: number;
}

export interface CalendarEvent {
  id: string;
  type: string;
  title: string;
  startDate: string;
  endDate?: string;
  description?: string;
  status?: string;
  color?: string;
  relatedId?: string;
}

export interface ParentMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
}

export interface ParentNotification {
  id: string;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
}

export interface StudentDashboardSummary {
  pendingAssignmentsCount: number;
  testsSolvedThisWeek: number;
  totalQuestionsThisWeek: number;
  averageScorePercent: number;
  lastWatchedContents: Array<{
    contentId: string;
    title: string;
    lastPositionSeconds: number;
  }>;
}

export interface StudentAssignment {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  testId?: string;
  contentId?: string;
}

export type QuestionType = 'multiple_choice' | 'true_false' | 'open_ended';

export interface Question {
  id: string;
  testId: string;
  text: string;
  type: QuestionType;
  choices?: string[];
  correctAnswer?: string;
  solutionExplanation?: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface Test {
  id: string;
  title: string;
  subjectId: string;
  topic: string;
  questionIds: string[];
}

export interface StudentAssignmentDetail {
  assignment: StudentAssignment;
  test?: Test;
  questions: Question[];
}

export interface StudentContent {
  id: string;
  title: string;
  description?: string;
  durationMinutes?: number;
  url?: string;
  subjectId?: string;
  topic?: string;
   gradeLevel?: string;
}

export interface ProgressOverview {
  topics: Array<{
    topic: string;
    completionPercent: number;
    averageScorePercent: number;
  }>;
  overallCompletionPercent: number;
  totalTestsCompleted: number;
  totalQuestionsSolved: number;
  averageScorePercent: number;
}

export interface ProgressCharts {
  daily: Array<{
    date: string;
    questionsSolved: number;
    testsCompleted: number;
    averageScore: number;
    studyMinutes: number;
  }>;
}

export interface StudentMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  meetingUrl: string;
}

export interface StudentAiChatMessage {
  role: 'user' | 'assistant';
  content?: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface StudentAiChatResponse {
  reply: string;
  model: string;
  attachment?: {
    filename: string;
    mimeType: string;
    data: string;
  };
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed';
export type TodoPriority = 'low' | 'medium' | 'high';

export interface StudentTodo {
  id: string;
  studentId: string;
  title: string;
  description?: string;
  status: TodoStatus;
  priority: TodoPriority;
  createdAt: string;
  plannedDate?: string;
  completedAt?: string;
  relatedAssignmentId?: string;
  relatedContentId?: string;
}

export interface TeacherDashboardSummary {
  totalStudents: number;
  testsAssignedThisWeek: number;
  averageScoreLast7Days: number;
  recentActivity: string[];
}

export interface TeacherContent {
  id: string;
  title: string;
  type: string;
  updatedAt?: string;
  subjectId?: string;
  topic?: string;
  gradeLevel?: string;
  url?: string;
}

export interface TeacherStudent {
  id: string;
  name: string;
  gradeLevel?: string;
  classId?: string;
}

export interface TeacherStudentProfile {
  student: TeacherStudent;
  assignments: Array<{
    id: string;
    title: string;
    dueDate: string;
    testId?: string;
    contentId?: string;
  }>;
  results: Array<{
    id: string;
    testId: string;
    scorePercent: number;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    durationSeconds: number;
    completedAt: string;
  }>;
  watchRecords: Array<{
    contentId: string;
    watchedPercent: number;
    completed: boolean;
    lastWatchedAt?: string;
  }>;
}

export interface TeacherCalendarEvent extends CalendarEvent {}

export interface TeacherMeeting {
  id: string;
  title: string;
  meetingUrl: string;
  scheduledAt: string;
  durationMinutes?: number;
}

export interface LiveClassSession {
  mode: 'internal' | 'external';
  provider?: string;
  url?: string;
  meetingUrl?: string;
  roomId?: string;
  token?: string;
}

export interface TeacherAnnouncement {
  id: string;
  teacherId: string;
  title: string;
  message: string;
  status: 'draft' | 'planned' | 'sent';
  createdAt: string;
  scheduledDate?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';
const AUTH_STORAGE_KEY = 'student_mgmt_auth';

function clearAuthAndRedirectToLogin() {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    const errorBody = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.includes('/auth/login')) {
      clearAuthAndRedirectToLogin();
    }
    throw new Error(errorBody.error ?? `API error: ${res.status}`);
  }

  return res.json();
}

export async function login(
  email: string,
  password: string,
  role: UserRole,
): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, role }),
  });
}

export function getParentDashboard(token: string) {
  return apiRequest<ParentDashboardSummary>('/parent/dashboard', {}, token);
}

export function getParentChildSummary(token: string, studentId: string) {
  return apiRequest<StudentDetailSummary>(`/parent/children/${studentId}/summary`, {}, token);
}

export function getParentConversations(token: string) {
  return apiRequest<Conversation[]>('/parent/messages/conversations', {}, token);
}

export function getParentConversation(token: string, userId: string, studentId?: string) {
  const query = studentId ? `?studentId=${studentId}` : '';
  return apiRequest<Message[]>(`/parent/messages/conversation/${userId}${query}`, {}, token);
}

export function sendParentMessage(
  token: string,
  payload: { toUserId: string; text: string; studentId?: string; subject?: string },
) {
  return apiRequest<Message>(
    '/parent/messages',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function markParentMessageRead(token: string, messageId: string) {
  return apiRequest(`/parent/messages/${messageId}/read`, { method: 'PUT' }, token);
}

export function getParentCalendar(token: string, startDate: string, endDate: string) {
  return apiRequest<{ events: CalendarEvent[] }>(
    `/parent/calendar?startDate=${startDate}&endDate=${endDate}&viewType=week`,
    {},
    token,
  );
}

export function getParentNotifications(token: string, limit = 5) {
  return apiRequest<ParentNotification[]>(`/parent/notifications?limit=${limit}`, {}, token);
}

export function getParentMeetings(token: string) {
  return apiRequest<ParentMeeting[]>('/parent/meetings', {}, token);
}

export function joinParentMeeting(token: string, meetingId: string) {
  return apiRequest<{ meetingUrl: string }>(`/parent/meetings/${meetingId}/join`, { method: 'POST' }, token);
}

export function getStudentDashboard(token: string) {
  return apiRequest<StudentDashboardSummary>('/student/dashboard', {}, token);
}

export function getStudentAssignments(token: string) {
  return apiRequest<StudentAssignment[]>('/student/assignments', {}, token);
}

export function getStudentAssignmentDetail(token: string, assignmentId: string) {
  return apiRequest<StudentAssignmentDetail>(`/student/assignments/${assignmentId}`, {}, token);
}

export function getStudentContents(token: string) {
  return apiRequest<StudentContent[]>('/student/contents', {}, token);
}

export function watchStudentContent(
  token: string,
  contentId: string,
  watchedSeconds: number,
  completed: boolean,
) {
  return apiRequest(
    `/student/contents/${contentId}/watch`,
    {
      method: 'POST',
      body: JSON.stringify({ watchedSeconds, completed }),
    },
    token,
  );
}

export function submitStudentAssignment(
  token: string,
  assignmentId: string,
  answers: Array<{ questionId: string; answer: string; scratchpadImageData?: string }>,
  durationSeconds: number,
) {
  return apiRequest(
    `/student/assignments/${assignmentId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({ answers, durationSeconds }),
    },
    token,
  );
}

export function getStudentProgressTopics(token: string) {
  return apiRequest<ProgressOverview>('/student/progress/topics', {}, token);
}

export function getStudentProgressCharts(token: string) {
  return apiRequest<ProgressCharts>('/student/progress/charts', {}, token);
}

export function getStudentCalendar(token: string, startDate: string, endDate: string) {
  return apiRequest<{ events: CalendarEvent[] }>(
    `/student/calendar?startDate=${startDate}&endDate=${endDate}&viewType=week`,
    {},
    token,
  );
}

export function getStudentMeetings(token: string) {
  return apiRequest<StudentMeeting[]>('/student/meetings', {}, token);
}

export function sendStudentAiMessage(
  token: string,
  payload: {
    message?: string;
    history?: StudentAiChatMessage[];
    imageBase64?: string;
    imageMimeType?: string;
  },
) {
  return apiRequest<StudentAiChatResponse>(
    '/student/ai/chat',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function getStudentTodos(token: string) {
  return apiRequest<StudentTodo[]>('/student/todos', {}, token);
}

export function uploadTeacherVideo(token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch('http://localhost:4000/teacher/contents/upload-video', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error ?? `API error: ${res.status}`);
    }
    return res.json() as Promise<{ url: string }>;
  });
}

export function createStudentTodo(
  token: string,
  payload: {
    title: string;
    description?: string;
    priority?: TodoPriority;
    plannedDate?: string;
    relatedAssignmentId?: string;
    relatedContentId?: string;
  },
) {
  return apiRequest<StudentTodo>(
    '/student/todos',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateStudentTodo(
  token: string,
  todoId: string,
  updates: Partial<{
    title: string;
    description: string;
    status: TodoStatus;
    priority: TodoPriority;
    plannedDate: string | null;
  }>,
) {
  const sanitized = {
    ...updates,
    plannedDate: updates.plannedDate ?? undefined,
  };
  return apiRequest<StudentTodo>(
    `/student/todos/${todoId}`,
    {
      method: 'PUT',
      body: JSON.stringify(sanitized),
    },
    token,
  );
}

export function deleteStudentTodo(token: string, todoId: string) {
  return apiRequest<StudentTodo>(`/student/todos/${todoId}`, { method: 'DELETE' }, token);
}

export function getTeacherDashboard(token: string) {
  return apiRequest<TeacherDashboardSummary>('/teacher/dashboard', {}, token);
}

export function getTeacherContents(token: string) {
  return apiRequest<TeacherContent[]>('/teacher/contents', {}, token);
}

export function createTeacherContent(
  token: string,
  payload: {
    title: string;
    type: string;
    subjectId: string;
    topic: string;
    gradeLevel: string;
    url: string;
    description?: string;
    durationMinutes?: number;
    tags?: string[];
  },
) {
  return apiRequest<TeacherContent>(
    '/teacher/contents',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function getTeacherCalendar(token: string, startDate: string, endDate: string) {
  return apiRequest<{ events: CalendarEvent[] }>(
    `/teacher/calendar?startDate=${startDate}&endDate=${endDate}&viewType=week`,
    {},
    token,
  );
}

export function getTeacherStudents(token: string) {
  return apiRequest<TeacherStudent[]>('/teacher/students', {}, token);
}

export function getTeacherStudentProfile(token: string, studentId: string) {
  return apiRequest<TeacherStudentProfile>(`/teacher/students/${studentId}`, {}, token);
}

export function getTeacherAssignments(token: string) {
  return apiRequest<StudentAssignment[]>('/teacher/assignments', {}, token);
}

export function getTeacherMessages(token: string) {
  return apiRequest<(Message & { fromUserName?: string; toUserName?: string })[]>(
    '/teacher/messages',
    {},
    token,
  );
}

export function sendTeacherMessage(token: string, payload: { toUserId: string; text: string }) {
  return apiRequest<Message>(
    '/teacher/messages',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function getTeacherMeetings(token: string) {
  return apiRequest<TeacherMeeting[]>('/teacher/meetings', {}, token);
}

export function createTeacherMeeting(
  token: string,
  payload: {
    type: 'teacher_student' | 'teacher_student_parent' | 'class';
    title: string;
    studentIds?: string[];
    parentIds?: string[];
    scheduledAt: string;
    durationMinutes: number;
    meetingUrl: string;
  },
) {
  return apiRequest<TeacherMeeting>(
    '/teacher/meetings',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateTeacherMeeting(
  token: string,
  meetingId: string,
  payload: {
    title?: string;
    scheduledAt?: string;
    durationMinutes?: number;
  },
) {
  return apiRequest<TeacherMeeting>(
    `/teacher/meetings/${meetingId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteTeacherMeeting(token: string, meetingId: string) {
  return apiRequest<void>(`/teacher/meetings/${meetingId}`, { method: 'DELETE' }, token);
}

export function startTeacherLiveMeeting(token: string, meetingId: string) {
  return apiRequest<LiveClassSession>(
    `/teacher/meetings/${meetingId}/start-live`,
    {
      method: 'POST',
    },
    token,
  );
}

export function joinStudentLiveMeeting(token: string, meetingId: string) {
  return apiRequest<LiveClassSession>(
    `/student/meetings/${meetingId}/join-live`,
    {
      method: 'POST',
    },
    token,
  );
}

export function getTeacherAnnouncements(token: string) {
  return apiRequest<TeacherAnnouncement[]>('/teacher/announcements', {}, token);
}

export function createTeacherAnnouncement(
  token: string,
  payload: { title: string; message: string; scheduledDate?: string | null },
) {
  return apiRequest<TeacherAnnouncement>(
    '/teacher/announcements',
    {
      method: 'POST',
      body: JSON.stringify({
        title: payload.title,
        message: payload.message,
        scheduledDate: payload.scheduledDate ?? undefined,
      }),
    },
    token,
  );
}

export function sendTeacherAiMessage(
  token: string,
  payload: {
    message?: string;
    history?: StudentAiChatMessage[];
    format?: 'pdf' | 'xlsx' | null;
  },
) {
  // Öğretmen paneli için ayrı endpoint
  return apiRequest<StudentAiChatResponse>(
    '/teacher/ai/chat',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

