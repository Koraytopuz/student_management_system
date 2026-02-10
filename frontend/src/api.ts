export type UserRole = 'teacher' | 'student' | 'parent' | 'admin';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Bazı dashboard'larda default seçim için kullanılır */
  gradeLevel?: string;
  /** Öğretmenler için: atanmış branşlar */
  subjectAreas?: string[];
  /** Öğretmenler için: yetkili olduğu sınıf seviyeleri (\"4\"–\"12\") */
  assignedGrades?: string[];
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
  fromUserName?: string;
  toUserName?: string;
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
  type?: string;
  relatedEntityType?: string;
  relatedEntityId?: string;
}

export interface AdminNotification {
  id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  relatedEntityType?: string;
  relatedEntityId?: string;
  readAt?: string;
  createdAt: string;
}

export interface TeacherNotification {
  id: string;
  userId: string;
  studentId?: string;
  type: string;
  title: string;
  body: string;
  relatedEntityType?: 'assignment' | 'test' | 'meeting' | 'message' | 'content' | 'feedback' | 'help_request';
  relatedEntityId?: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}

export interface TeacherFeedbackItem {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  type: string;
  relatedTestId?: string;
  relatedAssignmentId?: string;
  title: string;
  content: string;
  read: boolean;
  createdAt: string;
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

export type BadgeCategory =
  | 'questions_solved'
  | 'tests_completed'
  | 'assignments_completed'
  | 'content_watched'
  | 'streak'
  | 'mixed';

export interface StudentBadgeProgress {
  badgeId: string;
  code: string;
  title: string;
  description: string;
  category: BadgeCategory;
  icon?: string;
  color?: string;
  targetValue: number;
  metricKey: string;
  currentValue: number;
  progressPercent: number;
  earned: boolean;
  earnedAt?: string;
}

export interface StudentAssignment {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  testId?: string;
  contentId?: string;
  testAssetId?: string;
  timeLimitMinutes?: number;
  testAsset?: {
    id: string;
    title: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    answerKeyJson?: string;
  };
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

export interface StudentContentWatchRecord {
  watchedSeconds: number;
  completed: boolean;
  lastWatchedAt?: string;
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
  watchRecord?: StudentContentWatchRecord;
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
  durationMinutes?: number;
}

export interface StudentCoachingSession {
  id: string;
  teacherId: string;
  teacherName: string;
  date: string;
  durationMinutes?: number;
  title: string;
  mode: 'audio' | 'video';
  meetingId?: string;
  meetingUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TeacherListItem {
  id: string;
  name: string;
  email: string;
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

export interface StudentStudyPlan {
  id: string;
  studentId?: string;
  focusTopic?: string;
  gradeLevel?: string;
  subject?: string;
  weeklyHours: number;
  content: string;
  createdAt: string;
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

export interface CurriculumTopic {
  id: string;
  subjectId: string;
  gradeLevel: string;
  unitNumber: number;
  topicName: string;
  kazanimKodu: string;
  kazanimText: string;
  orderIndex: number;
  subject?: { id: string; name: string };
}

export interface TeacherStudent {
  id: string;
  name: string;
  gradeLevel?: string;
  classId?: string;
  lastSeenAt?: string;
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

export interface TeacherCoachingSession {
  id: string;
  studentId: string;
  teacherId: string;
  meetingId?: string;
  date: string;
  durationMinutes?: number;
  title: string;
  notes: string;
  mode: 'audio' | 'video';
  meetingUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export type CoachingGoalStatus = 'pending' | 'completed' | 'missed';

export interface TeacherCoachingGoal {
  id: string;
  studentId: string;
  coachId: string;
  title: string;
  description?: string;
  deadline: string;
  status: CoachingGoalStatus;
  createdAt: string;
  isOverdue: boolean;
}

export type CoachingNoteVisibility = 'teacher_only' | 'shared_with_parent';

export interface TeacherCoachingNote {
  id: string;
  studentId: string;
  coachId: string;
  content: string;
  visibility: CoachingNoteVisibility;
  date: string;
}

export interface ParentCoachingNote {
  id: string;
  studentId: string;
  coachId: string;
  coachName: string;
  content: string;
  visibility: CoachingNoteVisibility;
  date: string;
}

export interface ParentCoachingProgress {
  goals: Array<{
    id: string;
    studentId: string;
    coachId: string;
    coachName: string;
    title: string;
    description?: string;
    deadline: string;
    status: CoachingGoalStatus;
    createdAt: string;
    isOverdue: boolean;
  }>;
  completionPercent: number;
  pendingCount: number;
  completedCount: number;
  missedCount: number;
  overduePendingCount: number;
}

export interface TeacherCalendarEvent extends CalendarEvent { }

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

export interface TeacherTest {
  id: string;
  title: string;
  subjectId: string;
  topic: string;
  questionIds: string[];
  createdByTeacherId: string;
}

export interface TeacherTestAsset {
  id: string;
  teacherId: string;
  title: string;
  subjectId: string;
  topic: string;
  gradeLevel: string;
  fileUrl: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

export type TeacherQuestionType = 'multiple_choice' | 'true_false' | 'open_ended';

export interface TeacherQuestionDraft {
  text: string;
  type: TeacherQuestionType;
  choices?: string[];
  correctAnswer?: string;
  solutionExplanation?: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface HelpResponsePayload {
  id: string;
  mode: 'audio_only' | 'audio_video';
  url: string;
  mimeType?: string;
  createdAt: string;
  playedAt?: string;
}

export interface StudentHelpRequest {
  id: string;
  studentId: string;
  teacherId: string;
  assignmentId: string;
  questionId?: string;
  message?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  createdAt: string;
  resolvedAt?: string;
  response?: HelpResponsePayload;
}

export interface TeacherHelpRequestItem {
  id: string;
  studentId: string;
  studentName: string;
  teacherId: string;
  assignmentId: string;
  assignmentTitle: string;
  questionId?: string;
  questionNumber?: number;
  questionText?: string;
  correctAnswer?: string;
  studentAnswer?: string;
  testAssetFileUrl?: string;
  testAssetId?: string;
  message?: string;
  status: 'open' | 'in_progress' | 'resolved' | 'cancelled';
  createdAt: string;
  resolvedAt?: string;
  response?: HelpResponsePayload;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000';

/** Backend URL - uploads vb. relative yollar için kullanılır */
export function getApiBaseUrl(): string {
  return API_BASE_URL.replace(/\/$/, '');
}
const AUTH_STORAGE_KEY = 'student_mgmt_auth';
const BASE_PATH = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '') || '';

function clearAuthAndRedirectToLogin() {
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch {
    // ignore
  }
  if (typeof window !== 'undefined') {
    const loginPath = BASE_PATH ? `${BASE_PATH}/login` : '/login';
    const path = window.location.pathname.replace(/\/$/, '');
    const isLoginPage = path === '/login' || path.endsWith('/login');
    if (!isLoginPage) {
      window.location.href = loginPath;
    }
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

export function markTeacherMessageRead(token: string, messageId: string) {
  return apiRequest(`/teacher/messages/${messageId}/read`, { method: 'PUT' }, token);
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

export function getTeacherNotifications(token: string, limit = 5) {
  return apiRequest<TeacherNotification[]>(`/teacher/notifications?limit=${limit}`, {}, token);
}

export function getTeacherUnreadNotificationCount(token: string) {
  return apiRequest<{ count: number }>('/teacher/notifications/unread-count', {}, token);
}

export function markTeacherNotificationRead(token: string, notificationId: string) {
  return apiRequest(`/teacher/notifications/${notificationId}/read`, { method: 'PUT' }, token);
}

export function markAllTeacherNotificationsRead(token: string) {
  return apiRequest('/teacher/notifications/read-all', { method: 'PUT' }, token);
}

export function deleteTeacherNotification(token: string, notificationId: string) {
  return apiRequest(`/teacher/notifications/${notificationId}`, { method: 'DELETE' }, token);
}

export function getAdminNotifications(token: string, limit = 50) {
  return apiRequest<AdminNotification[]>(`/admin/notifications?limit=${limit}`, {}, token);
}

export function markAdminNotificationRead(token: string, notificationId: string) {
  return apiRequest(`/admin/notifications/${notificationId}/read`, { method: 'PUT' }, token);
}

export function getParentMeetings(token: string) {
  return apiRequest<ParentMeeting[]>('/parent/meetings', {}, token);
}

export function getParentChildFeedback(token: string, studentId: string) {
  return apiRequest<TeacherFeedbackItem[]>(`/parent/children/${studentId}/feedback`, {}, token);
}

export function joinParentMeeting(token: string, meetingId: string) {
  return apiRequest<{ meetingUrl: string }>(`/parent/meetings/${meetingId}/join`, { method: 'POST' }, token);
}

export function getStudentDashboard(token: string) {
  return apiRequest<StudentDashboardSummary>('/student/dashboard', {}, token);
}

export function getStudentBadges(token: string) {
  return apiRequest<StudentBadgeProgress[]>('/student/badges', {}, token).then((payload: any) => {
    if (Array.isArray(payload)) {
      return payload as StudentBadgeProgress[];
    }
    if (payload && Array.isArray(payload.badges)) {
      return payload.badges as StudentBadgeProgress[];
    }
    return [];
  });
}

export function recordFocusSession(token: string, xp: number) {
  return apiRequest<{ success: boolean; xp: number }>(
    '/student/focus-session',
    { method: 'POST', body: JSON.stringify({ xp }) },
    token,
  );
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
  return apiRequest<{
    id: string;
    assignmentId: string;
    studentId: string;
    testId: string;
    answers: Array<{
      questionId: string;
      answer: string;
      isCorrect: boolean;
      scratchpadImageData?: string;
    }>;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    scorePercent: number;
    durationSeconds: number;
    completedAt: string;
    questionBankAnalysis?: {
      testTitle: string;
      overallScorePercent: number;
      overallLevel: 'weak' | 'average' | 'strong';
      topics: Array<{
        topic: string;
        totalQuestions: number;
        correct: number;
        incorrect: number;
        blank: number;
        scorePercent: number;
        strength: 'weak' | 'average' | 'strong';
      }>;
      weakTopics: string[];
      strongTopics: string[];
      recommendedNextActions: string[];
    };
  }>(
    `/student/assignments/${assignmentId}/submit`,
    {
      method: 'POST',
      body: JSON.stringify({ answers, durationSeconds }),
    },
    token,
  );
}

export function completeStudentAssignment(
  token: string,
  assignmentId: string,
  submittedInLiveClass?: boolean,
  answers?: Record<string, string>,
) {
  const body: { submittedInLiveClass?: boolean; answers?: Record<string, string> } = {};
  if (submittedInLiveClass) body.submittedInLiveClass = submittedInLiveClass;
  if (answers && Object.keys(answers).length > 0) body.answers = answers;
  return apiRequest(
    `/student/assignments/${assignmentId}/complete`,
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    token,
  );
}

export function createStudentHelpRequest(
  token: string,
  payload: { assignmentId: string; questionId: string; message?: string; studentAnswer?: string },
) {
  return apiRequest<StudentHelpRequest>(
    '/student/help-requests',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function getStudentHelpRequests(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<StudentHelpRequest[]>(`/student/help-requests${q}`, {}, token);
}

export function getStudentHelpRequest(token: string, helpRequestId: string) {
  return apiRequest<StudentHelpRequest>(`/student/help-requests/${helpRequestId}`, {}, token);
}

export function markStudentHelpResponsePlayed(token: string, helpRequestId: string) {
  return apiRequest<{ success: boolean; alreadyPlayed?: boolean; playedAt?: string }>(
    `/student/help-requests/${helpRequestId}/response-played`,
    { method: 'POST' },
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

export function getStudentCoachingSessions(token: string) {
  return apiRequest<StudentCoachingSession[]>('/student/coaching', {}, token);
}

export function getStudentTeachers(token: string) {
  return apiRequest<TeacherListItem[]>('/student/teachers', {}, token);
}

export function getParentTeachers(token: string) {
  return apiRequest<TeacherListItem[]>('/parent/teachers', {}, token);
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

export interface ComplaintItem {
  id: string;
  fromRole: string;
  fromUser?: { id: string; name: string; email: string; role: string };
  aboutTeacher?: { id: string; name: string; email: string; role: string };
  aboutTeacherId?: string;
  subject: string;
  body: string;
  status: 'open' | 'reviewed' | 'closed';
  createdAt: string;
  reviewedAt?: string;
  closedAt?: string;
}

export function createStudentComplaint(
  token: string,
  payload: { subject: string; body: string; aboutTeacherId?: string },
) {
  return apiRequest<ComplaintItem>(
    '/student/complaints',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function createParentComplaint(
  token: string,
  payload: { subject: string; body: string; aboutTeacherId?: string },
) {
  return apiRequest<ComplaintItem>(
    '/parent/complaints',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function getParentCoachingNotes(token: string, studentId: string) {
  return apiRequest<ParentCoachingNote[]>(
    `/parent/children/${studentId}/coaching-notes`,
    {},
    token,
  );
}

export function getParentCoachingProgress(token: string, studentId: string) {
  return apiRequest<ParentCoachingProgress>(
    `/parent/children/${studentId}/coaching-progress`,
    {},
    token,
  );
}

export function getAdminComplaints(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<ComplaintItem[]>(`/admin/complaints${q}`, {}, token);
}

export function updateAdminComplaintStatus(token: string, complaintId: string, status: 'open' | 'reviewed' | 'closed') {
  return apiRequest<ComplaintItem>(
    `/admin/complaints/${complaintId}`,
    { method: 'PUT', body: JSON.stringify({ status }) },
    token,
  );
}

export function getStudentTodos(token: string) {
  return apiRequest<StudentTodo[]>('/student/todos', {}, token);
}

export function uploadTeacherVideo(token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE_URL}/teacher/contents/upload-video`, {
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

export function getCurriculumTopics(
  token: string,
  params: { subjectId?: string; gradeLevel?: string },
) {
  const search = new URLSearchParams();
  if (params.subjectId) search.set('subjectId', params.subjectId);
  if (params.gradeLevel) search.set('gradeLevel', params.gradeLevel);
  const query = search.toString();
  const url = query ? `/questionbank/curriculum/topics?${query}` : '/questionbank/curriculum/topics';
  return apiRequest<CurriculumTopic[]>(url, {}, token);
}

export function getCurriculumSubjects(
  token: string,
  gradeLevel: string,
) {
  return apiRequest<Array<{ id: string; name: string }>>(
    `/questionbank/curriculum/subjects?gradeLevel=${gradeLevel}`,
    {},
    token
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

export function getTeacherCoachingSessions(token: string, studentId: string) {
  return apiRequest<TeacherCoachingSession[]>(
    `/teacher/students/${studentId}/coaching`,
    {},
    token,
  );
}

export function getTeacherCoachingGoals(token: string, studentId: string) {
  return apiRequest<TeacherCoachingGoal[]>(
    `/teacher/students/${studentId}/coaching-goals`,
    {},
    token,
  );
}

export function createTeacherCoachingGoal(
  token: string,
  studentId: string,
  payload: {
    title: string;
    description?: string;
    deadline: string;
  },
) {
  return apiRequest<TeacherCoachingGoal>(
    `/teacher/students/${studentId}/coaching-goals`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateTeacherCoachingGoal(
  token: string,
  goalId: string,
  updates: Partial<{
    title: string;
    description: string;
    deadline: string;
    status: CoachingGoalStatus;
  }>,
) {
  return apiRequest<TeacherCoachingGoal>(
    `/teacher/coaching-goals/${goalId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(updates),
    },
    token,
  );
}

export function getTeacherCoachingNotes(token: string, studentId: string) {
  return apiRequest<TeacherCoachingNote[]>(
    `/teacher/students/${studentId}/coaching-notes`,
    {},
    token,
  );
}

export function createTeacherCoachingNote(
  token: string,
  studentId: string,
  payload: {
    content: string;
    visibility?: CoachingNoteVisibility;
    date?: string;
  },
) {
  return apiRequest<TeacherCoachingNote>(
    `/teacher/students/${studentId}/coaching-notes`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function createTeacherCoachingSession(
  token: string,
  studentId: string,
  payload: {
    date: string;
    durationMinutes?: number;
    title: string;
    notes: string;
    mode?: 'audio' | 'video';
    meetingUrl?: string;
  },
) {
  return apiRequest<TeacherCoachingSession>(
    `/teacher/students/${studentId}/coaching`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function updateTeacherCoachingSession(
  token: string,
  sessionId: string,
  payload: Partial<{
    date: string;
    durationMinutes?: number | null;
    title: string;
    notes: string;
    mode: 'audio' | 'video';
    meetingUrl?: string | null;
  }>,
) {
  return apiRequest<TeacherCoachingSession>(
    `/teacher/coaching/${sessionId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function deleteTeacherCoachingSession(token: string, sessionId: string) {
  return apiRequest<{ success: boolean }>(
    `/teacher/coaching/${sessionId}`,
    { method: 'DELETE' },
    token,
  );
}

export function updateStudentCoachingGoalStatus(
  token: string,
  goalId: string,
  status: CoachingGoalStatus,
) {
  return apiRequest<TeacherCoachingGoal>(
    `/student/coaching/goals/${goalId}`,
    {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    },
    token,
  );
}

export function getTeacherAssignments(token: string) {
  return apiRequest<StudentAssignment[]>('/teacher/assignments', {}, token);
}

export function createTeacherAssignment(
  token: string,
  payload: {
    title: string;
    description?: string;
    dueDate: string;
    points?: number;
    studentIds?: string[];
    classId?: string;
    testId?: string;
    testAssetId?: string;
    contentId?: string;
    timeLimitMinutes?: number;
  },
) {
  return apiRequest<StudentAssignment>(
    '/teacher/assignments',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function getTeacherMessages(token: string) {
  return apiRequest<(Message & { fromUserName?: string; toUserName?: string })[]>(
    '/teacher/messages',
    {},
    token,
  );
}

export function getTeacherParents(
  token: string,
): Promise<{ id: string; name: string; email: string; role: 'parent'; studentIds: string[] }[]> {
  return apiRequest('/teacher/parents', {}, token);
}

export function sendTeacherMessage(
  token: string,
  payload: { toUserId: string; text: string; studentId?: string; subject?: string },
) {
  return apiRequest<Message>(
    '/teacher/messages',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

export function createTeacherFeedback(
  token: string,
  payload: {
    studentId: string;
    type: string;
    title: string;
    content: string;
    relatedTestId?: string;
    relatedAssignmentId?: string;
  },
) {
  return apiRequest<TeacherFeedbackItem>(
    '/teacher/feedback',
    { method: 'POST', body: JSON.stringify(payload) },
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
    targetGrade?: string;
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

export function muteAllInMeeting(token: string, meetingId: string) {
  return apiRequest<{ success: boolean; muted: number }>(
    `/teacher/meetings/${meetingId}/mute-all`,
    { method: 'POST' },
    token,
  );
}

/** Derse kayıtlı öğrencileri getir (yoklama modalı için) */
export function getMeetingAttendanceStudents(token: string, meetingId: string) {
  return apiRequest<{
    meetingId: string;
    meetingTitle: string;
    students: Array<{ id: string; name: string }>;
  }>(`/teacher/meetings/${meetingId}/attendance-students`, {}, token);
}

/** Yoklama kaydet – velilere otomatik bildirim gider */
export function submitMeetingAttendance(
  token: string,
  meetingId: string,
  attendance: Array<{ studentId: string; present: boolean }>,
) {
  return apiRequest<{ success: boolean; saved: number; attendance: typeof attendance }>(
    `/teacher/meetings/${meetingId}/attendance`,
    {
      method: 'POST',
      body: JSON.stringify({ attendance }),
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

export function getTeacherHelpRequests(token: string, status?: string) {
  const q = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiRequest<TeacherHelpRequestItem[]>(`/teacher/help-requests${q}`, {}, token);
}

export function respondTeacherHelpRequest(
  token: string,
  helpRequestId: string,
  payload: { mode: 'audio_only' | 'audio_video'; file: File },
) {
  const formData = new FormData();
  formData.append('mode', payload.mode);
  formData.append('file', payload.file);
  return fetch(`${API_BASE_URL}/teacher/help-requests/${helpRequestId}/respond`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error ?? `API error: ${res.status}`);
    }
    return res.json() as Promise<{ helpRequestId: string; response: HelpResponsePayload }>;
  });
}

export function deleteTeacherHelpResponse(token: string, helpRequestId: string) {
  return apiRequest<{ success: boolean }>(
    `/teacher/help-requests/${helpRequestId}/response`,
    { method: 'DELETE' },
    token,
  );
}

export function getTeacherTests(token: string) {
  return apiRequest<TeacherTest[]>('/teacher/tests', {}, token);
}

export function createTeacherStructuredTest(
  token: string,
  payload: {
    title: string;
    subjectId: string;
    topic: string;
    questions: TeacherQuestionDraft[];
  },
) {
  return apiRequest<TeacherTest>(
    '/teacher/tests/structured',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function uploadTeacherTestAssetFile(token: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  return fetch(`${API_BASE_URL}/teacher/test-assets/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  }).then(async (res) => {
    if (!res.ok) {
      const errorBody = await res.json().catch(() => ({}));
      throw new Error(errorBody.error ?? `API error: ${res.status}`);
    }
    return res.json() as Promise<{ url: string; fileName: string; mimeType: string }>;
  });
}

export function getTeacherTestAssets(token: string) {
  return apiRequest<TeacherTestAsset[]>('/teacher/test-assets', {}, token);
}

export function createTeacherTestAsset(
  token: string,
  payload: {
    title: string;
    subjectId: string;
    topic: string;
    gradeLevel: string;
    fileUrl: string;
    fileName: string;
    mimeType: string;
    answerKeyJson?: string;
  },
) {
  return apiRequest<TeacherTestAsset>(
    '/teacher/test-assets',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

export function deleteTeacherTestAsset(token: string, testAssetId: string) {
  return apiRequest<{ success: true }>(
    `/teacher/test-assets/${testAssetId}`,
    { method: 'DELETE' },
    token,
  );
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
  return apiRequest<StudentAiChatResponse>(
    '/teacher/ai/chat',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}

/** Otomatik soru üretimi */
export function generateTeacherQuestions(
  token: string,
  payload: { gradeLevel?: string; topic: string; count?: number; difficulty?: string; format?: 'metin' | 'pdf' | 'xlsx' },
) {
  return apiRequest<{
    questions: string;
    attachment?: { filename: string; mimeType: string; data: string };
    answerKey?: Record<string, string>;
  }>('/teacher/ai/generate-questions', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

/** Ödev/cevap değerlendirme */
export function evaluateTeacherAnswer(
  token: string,
  payload: {
    questionText: string;
    correctAnswer: string;
    studentAnswer: string;
    questionType?: string;
  },
) {
  return apiRequest<{ evaluation: string }>('/teacher/ai/evaluate-answer', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

/** Metin özetleme (öğretmen) */
export function summarizeTeacherText(
  token: string,
  payload: { text: string; maxLength?: 'kısa' | 'orta' | 'uzun' },
) {
  return apiRequest<{ summary: string }>('/teacher/ai/summarize', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

/** Öğrenciye özel çalışma planı */
export function getStudentStudyPlan(
  token: string,
  payload?: { focusTopic?: string; weeklyHours?: number; gradeLevel?: string; subject?: string },
) {
  return apiRequest<{ studyPlan: string; planId: string }>('/student/ai/study-plan', {
    method: 'POST',
    body: JSON.stringify(payload ?? {}),
  }, token);
}

export function summarizeStudentText(
  token: string,
  payload: { text: string; maxLength?: 'kısa' | 'orta' | 'uzun' },
) {
  return apiRequest<{ summary: string }>('/student/ai/summarize', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

export function getStudentTestFeedback(
  token: string,
  testResultId: string,
  format?: 'pdf',
) {
  return apiRequest<{
    feedback: string;
    weakTopics: string[];
    strongTopics: string[];
    attachment?: {
      filename: string;
      mimeType: string;
      data: string;
    };
  }>(
    '/student/ai/test-feedback',
    {
      method: 'POST',
      body: JSON.stringify({
        testResultId,
        ...(format ? { format } : {}),
      }),
    },
    token,
  );
}

export function getStudentStudyPlans(token: string) {
  return apiRequest<StudentStudyPlan[]>('/student/study-plans', {}, token);
}

export function downloadStudentStudyPlanPdf(token: string, planId: string) {
  return apiRequest<{
    filename: string;
    mimeType: string;
    data: string;
  }>(`/student/study-plans/${planId}/pdf`, {}, token);
}

// =============================================================================
// QUESTION BANK API
// =============================================================================

export type BloomLevel = 'hatirlama' | 'anlama' | 'uygulama' | 'analiz' | 'degerlendirme' | 'yaratma';
export type QuestionBankSource = 'teacher' | 'ai' | 'import';

export interface QuestionBankItem {
  id: string;
  subjectId: string;
  gradeLevel: string;
  topic: string;
  subtopic?: string;
  kazanimKodu?: string;
  text: string;
  type: 'multiple_choice' | 'true_false' | 'open_ended';
  choices?: string[];
  correctAnswer: string;
  distractorReasons?: string[];
  solutionExplanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bloomLevel?: BloomLevel;
  estimatedMinutes?: number;
  source: QuestionBankSource;
  createdByTeacherId?: string;
  isApproved: boolean;
  approvedByTeacherId?: string;
  qualityScore?: number;
  usageCount: number;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  subject?: { id: string; name: string };
}

export interface QuestionBankPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface QuestionBankListResponse {
  questions: QuestionBankItem[];
  pagination: QuestionBankPagination;
}

export interface QuestionBankStats {
  total: number;
  approved: number;
  pending: number;
  bySource: { ai: number; teacher: number };
  bySubject: Array<{ subjectId: string; subjectName: string; count: number }>;
  byGrade: Array<{ gradeLevel: string; count: number }>;
  byDifficulty: Array<{ difficulty: string; count: number }>;
}

export interface QuestionBankSearchParams {
  subjectId?: string;
  gradeLevel?: string;
  topic?: string;
  difficulty?: string;
  bloomLevel?: string;
  type?: string;
  isApproved?: boolean;
  source?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export interface QuestionBankCreatePayload {
  subjectId: string;
  gradeLevel: string;
  topic: string;
  subtopic?: string;
  kazanimKodu?: string;
  text: string;
  type: 'multiple_choice' | 'true_false' | 'open_ended';
  choices?: string[];
  correctAnswer: string;
  distractorReasons?: string[];
  solutionExplanation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bloomLevel?: BloomLevel;
  estimatedMinutes?: number;
  tags?: string[];
}

export interface AIQuestionGeneratePayload {
  subjectId: string;
  gradeLevel: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  bloomLevel?: BloomLevel;
  questionType: 'multiple_choice' | 'true_false' | 'open_ended';
  count: number;
  referenceQuestionIds?: string[];
}

export interface SubjectItem {
  id: string;
  name: string;
}

/** Soru Bankası - Liste */
export function getQuestionBankList(token: string, params?: QuestionBankSearchParams) {
  const query = new URLSearchParams();
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        query.append(key, String(value));
      }
    });
  }
  const qs = query.toString() ? `?${query.toString()}` : '';
  return apiRequest<QuestionBankListResponse>(`/questionbank${qs}`, {}, token);
}

/** Soru Bankası - Tek soru */
export function getQuestionBankItem(token: string, id: string) {
  return apiRequest<QuestionBankItem>(`/questionbank/${id}`, {}, token);
}

/** Soru Bankası - Yeni soru */
export function createQuestionBankItem(token: string, payload: QuestionBankCreatePayload) {
  return apiRequest<QuestionBankItem>('/questionbank', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token);
}

/** Soru Bankası - Güncelle */
export function updateQuestionBankItem(token: string, id: string, payload: Partial<QuestionBankCreatePayload>) {
  return apiRequest<QuestionBankItem>(`/questionbank/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  }, token);
}

/** Soru Bankası - Sil */
export function deleteQuestionBankItem(token: string, id: string) {
  return apiRequest<{ success: boolean }>(`/questionbank/${id}`, { method: 'DELETE' }, token);
}

/** Soru Bankası - Onayla */
export function approveQuestionBankItem(token: string, id: string) {
  return apiRequest<QuestionBankItem>(`/questionbank/${id}/approve`, { method: 'POST' }, token);
}

/** Soru Bankası - AI ile üret */
export function generateQuestionBankItems(token: string, payload: AIQuestionGeneratePayload) {
  return apiRequest<{ success: boolean; message: string; questions: QuestionBankItem[] }>(
    '/questionbank/generate',
    { method: 'POST', body: JSON.stringify(payload) },
    token,
  );
}

/** Soru Bankası - İstatistikler */
export function getQuestionBankStats(token: string) {
  return apiRequest<QuestionBankStats>('/questionbank/stats', {}, token);
}

/** Ders listesi (tüm dersler) */
export function getSubjectsList(token: string) {
  return apiRequest<SubjectItem[]>('/questionbank/subjects/list', {}, token);
}

// =============================================================================
// STUDENT QUESTIONBANK FLOW
// =============================================================================

export interface StudentQuestionBankTopicMeta {
  topic: string;
  subtopics: string[];
  questionCount: number;
}

export interface StudentQuestionBankSubjectMeta {
  subjectId: string;
  subjectName: string;
  gradeLevel: string;
  topics: StudentQuestionBankTopicMeta[];
}

export interface StudentQuestionBankMetaResponse {
  gradeLevel: string;
  subjects: StudentQuestionBankSubjectMeta[];
}

export function getStudentQuestionBankMeta(token: string, gradeLevel?: string) {
  const qs = gradeLevel ? `?gradeLevel=${encodeURIComponent(gradeLevel)}` : '';
  return apiRequest<StudentQuestionBankMetaResponse>(
    `/student/questionbank/meta${qs}`,
    {},
    token,
  );
}

export function startStudentQuestionBankTest(
  token: string,
  payload: {
    subjectId: string;
    topic: string;
    subtopic?: string;
    gradeLevel?: string;
    questionCount?: number;
  },
) {
  return apiRequest<StudentAssignmentDetail>(
    '/student/questionbank/start-test',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    token,
  );
}


