export type UserRole = 'teacher' | 'student' | 'parent' | 'admin';

export interface UserBase {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Kurum / dershane adı – multi-tenant ayrımı için */
  institutionName?: string;
}

export interface Teacher extends UserBase {
  role: 'teacher';
  subjectAreas: string[];
  /** Öğretmenin girebildiği sınıf seviyeleri (\"4\"–\"12\") */
  assignedGrades?: string[];
}

export interface Student extends UserBase {
  role: 'student';
  gradeLevel: string;
  classId: string;
  parentPhone?: string;
  profilePictureUrl?: string;
}

export interface Parent extends UserBase {
  role: 'parent';
  studentIds: string[];
}

export interface Admin extends UserBase {
  role: 'admin';
}

export type User = Teacher | Student | Parent | Admin;

export type BadgeCategory =
  | 'questions_solved'
  | 'tests_completed'
  | 'assignments_completed'
  | 'content_watched'
  | 'streak'
  | 'mixed';

export interface ClassGroup {
  id: string;
  name: string;
  gradeLevel: string;
  stream?: string | null;
  section?: string | null;
  teacherId: string;
  studentIds: string[];
}

export interface Subject {
  id: string;
  name: string;
}

export type ContentType = 'video' | 'audio' | 'document';

export interface ContentItem {
  id: string;
  title: string;
  description?: string;
  type: ContentType;
  subjectId: string;
  topic: string;
  gradeLevel: string;
  durationMinutes?: number;
  tags: string[];
  url: string;
  assignedToClassIds: string[];
  assignedToStudentIds: string[];
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
  createdByTeacherId: string;
}

export interface Assignment {
  id: string;
  title: string;
  description?: string;
  testId?: string;
  contentId?: string;
  classId?: string;
  assignedStudentIds: string[];
  dueDate: string;
  points: number;
}

export interface TestAnswer {
  questionId: string;
  answer: string;
  isCorrect: boolean;
  scratchpadImageData?: string;
}

export interface TestResult {
  id: string;
  assignmentId: string;
  studentId: string;
  testId: string;
  answers: TestAnswer[];
  correctCount: number;
  incorrectCount: number;
  blankCount: number;
  scorePercent: number;
  durationSeconds: number;
  completedAt: string;
}

export interface WatchRecord {
  id: string;
  contentId: string;
  studentId: string;
  watchedSeconds: number;
  completed: boolean;
  lastWatchedAt: string;
}

export type MeetingType = 'teacher_student' | 'teacher_student_parent' | 'class';

export interface Meeting {
  id: string;
  type: MeetingType;
  title: string;
  teacherId: string;
  studentIds: string[];
  parentIds: string[];
  scheduledAt: string;
  durationMinutes: number;
  meetingUrl: string;
}

export interface Message {
  id: string;
  fromUserId: string;
  toUserId: string;
  studentId?: string; // Hangi öğrenci için (çoklu öğrenci durumunda)
  subject?: string; // Mesaj konusu
  text: string;
  attachments?: {
    id: string;
    fileName: string;
    fileType: string;
    fileSize: number;
    url: string;
  }[];
  createdAt: string;
  read: boolean;
  readAt?: string;
}

export type NotificationType =
  | 'assignment_created'
  | 'assignment_due_soon'
  | 'assignment_overdue'
  | 'test_result_ready'
  | 'meeting_scheduled'
  | 'weekly_summary'
  | 'message_received'
  | 'goal_achieved'
  | 'content_assigned';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  createdAt: string;
  read: boolean;
  relatedEntityType?:
  | 'assignment'
  | 'test'
  | 'meeting'
  | 'message'
  | 'content';
  relatedEntityId?: string;
  readAt?: string;
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed';

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
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

export type GoalType =
  | 'weekly_questions'
  | 'weekly_tests'
  | 'topic_completion'
  | 'score_percent';

export type GoalStatus = 'active' | 'completed' | 'failed' | 'cancelled';

export interface Goal {
  id: string;
  studentId: string;
  type: GoalType;
  targetValue: number;
  topic?: string;
  startDate: string;
  endDate: string;
  status: GoalStatus;
  createdAt: string;
}

export interface TopicProgress {
  topic: string;
  subjectName: string;
  completionPercent: number;
  testsCompleted: number;
  testsTotal: number;
  averageScorePercent: number;
  lastActivityDate?: string;
  strengthLevel: 'weak' | 'average' | 'strong';
}

export interface ProgressOverview {
  topics: TopicProgress[];
  overallCompletionPercent: number;
  totalTestsCompleted: number;
  totalQuestionsSolved: number;
  averageScorePercent: number;
}

export interface TimeSeriesPoint {
  date: string;
  questionsSolved: number;
  testsCompleted: number;
  averageScore: number;
  studyMinutes: number;
}

export interface ProgressCharts {
  dailyData: TimeSeriesPoint[];
}

export interface GoalWithComputed extends Goal {
  currentValue: number;
  progressPercent: number;
}

export interface GoalProgress {
  goal: GoalWithComputed;
  dailyProgress: { date: string; value: number }[];
  estimatedCompletionDate?: string;
  onTrack: boolean;
}

export interface TeacherDashboardSummary {
  totalStudents: number;
  testsAssignedThisWeek: number;
  averageScoreLast7Days: number;
  recentActivity: string[];
}

export type TeacherAnnouncementStatus = 'draft' | 'planned' | 'sent';

export interface TeacherAnnouncement {
  id: string;
  teacherId: string;
  title: string;
  message: string;
  status: TeacherAnnouncementStatus;
  createdAt: string;
  scheduledDate?: string;
}

export interface StudentDashboardSummary {
  pendingAssignmentsCount: number;
  testsSolvedThisWeek: number;
  totalQuestionsThisWeek: number;
  averageScorePercent: number;
  lastWatchedContents: { contentId: string; title: string; lastPositionSeconds: number }[];
}

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

export interface ParentDashboardSummaryStudentCard {
  studentId: string;
  studentName: string;
  gradeLevel: string;
  classId: string;
  className?: string;
  testsSolvedLast7Days: number;
  averageScorePercent: number;
  totalStudyMinutes: number;
  lastActivityDate?: string;
  status: 'active' | 'inactive';
  pendingAssignmentsCount: number;
  overdueAssignmentsCount: number;
  profilePictureUrl?: string;
}

export type CalendarEventType = 'assignment' | 'meeting' | 'exam';

export interface CalendarEvent {
  id: string;
  type: CalendarEventType;
  title: string;
  startDate: string; // ISO 8601 format
  endDate?: string; // ISO 8601 format (toplantılar için)
  description?: string;
  status?: 'pending' | 'completed' | 'overdue' | 'cancelled';
  color?: string; // Görsel ayırt etme için
  relatedId: string; // İlgili görev/toplantı/sınav ID'si
}

export interface ParentDashboardSummary {
  children: ParentDashboardSummaryStudentCard[];
  overallStats?: {
    totalChildren: number;
    totalTestsSolved: number;
    averageScoreAcrossAll: number;
  };
}

// Parent Panel - Activity Tracking
export interface ActivityTimeTracking {
  date: string;
  totalMinutes: number;
  testMinutes: number;
  contentWatchingMinutes: number;
  activeSessionMinutes: number;
  breakCount: number;
}

export interface ActivityTimeSummary {
  period: 'today' | 'last7days' | 'last30days' | 'custom';
  startDate?: string;
  endDate?: string;
  dailyData: ActivityTimeTracking[];
  totalMinutes: number;
  averageMinutesPerDay: number;
  mostActiveDay: string;
  activityByHour: { hour: number; minutes: number }[];
}

export interface AssignmentActivityItem {
  assignmentId: string;
  title: string;
  description?: string;
  type: 'test' | 'content' | 'mixed';
  subjectName: string;
  topic: string;
  dueDate: string;
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  completedAt?: string;
  testResult?: {
    testId: string;
    correctCount: number;
    incorrectCount: number;
    blankCount: number;
    scorePercent: number;
    durationSeconds: number;
  };
  contentProgress?: {
    contentId: string;
    watchedPercent: number;
    completed: boolean;
  };
}

export interface AssignmentActivitySummary {
  assignments: AssignmentActivityItem[];
  statistics: {
    totalCount: number;
    completedCount: number;
    pendingCount: number;
    overdueCount: number;
    averageScorePercent: number;
  };
}

export interface ContentUsageItem {
  contentId: string;
  title: string;
  description?: string;
  type: 'video' | 'audio' | 'document';
  subjectName: string;
  topic: string;
  totalDurationMinutes: number;
  watchedDurationMinutes: number;
  watchedPercent: number;
  watchCount: number;
  lastWatchedAt?: string;
  completed: boolean;
  assignedDate: string;
}

export interface ContentUsageSummary {
  contents: ContentUsageItem[];
  statistics: {
    totalContents: number;
    completedCount: number;
    inProgressCount: number;
    notStartedCount: number;
    totalWatchTimeMinutes: number;
    averageCompletionPercent: number;
  };
}

export interface ActivitySummary {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  testsSolved: number;
  questionsSolved: number;
  averageScorePercent: number;
  totalStudyMinutes: number;
  contentsWatched: number;
  contentsWatchTimeMinutes: number;
  assignmentsCompleted: number;
  assignmentsOverdue: number;
  topSubjects: { subjectName: string; studyMinutes: number }[];
  topTopics: { topic: string; studyMinutes: number }[];
  dailyBreakdown: {
    date: string;
    testsSolved: number;
    questionsSolved: number;
    studyMinutes: number;
  }[];
}

// Parent Panel - Reporting
export interface WeeklyReport {
  id: string;
  studentId: string;
  weekStartDate: string;
  weekEndDate: string;
  generatedAt: string;
  summary: ActivitySummary;
  comparisonWithPreviousWeek?: {
    testsSolvedChange: number;
    averageScoreChange: number;
    studyTimeChange: number;
  };
  topicPerformance: {
    topic: string;
    averageScore: number;
    testsCompleted: number;
    strengthLevel: 'weak' | 'average' | 'strong';
  }[];
  teacherFeedback?: string;
  recommendations: string[];
}

export interface MonthlyReport {
  id: string;
  studentId: string;
  month: number;
  year: number;
  generatedAt: string;
  summary: {
    testsSolved: number;
    questionsSolved: number;
    averageScorePercent: number;
    totalStudyMinutes: number;
    assignmentsCompleted: number;
  };
  weeklyBreakdown: {
    week: number;
    testsSolved: number;
    averageScore: number;
    studyMinutes: number;
  }[];
  topicAnalysis: {
    topic: string;
    testsCompleted: number;
    averageScore: number;
    improvementTrend: 'improving' | 'stable' | 'declining';
  }[];
  teacherEvaluation?: {
    overallComment: string;
    strengths: string[];
    areasForImprovement: string[];
  };
}

export interface CustomReportRequest {
  studentId: string;
  startDate: string;
  endDate: string;
  reportType: 'general' | 'detailed' | 'tests_only' | 'content_only';
}

export interface CustomReport {
  id: string;
  studentId: string;
  startDate: string;
  endDate: string;
  reportType: string;
  generatedAt: string;
  status: 'pending' | 'completed' | 'failed';
  data?: ActivitySummary;
  error?: string;
}

export interface PerformanceTrend {
  period: '1month' | '3months' | '6months' | '1year';
  startDate: string;
  endDate: string;
  weeklyData: {
    weekStart: string;
    averageScore: number;
    testsSolved: number;
    studyMinutes: number;
  }[];
  trendAnalysis: {
    scoreTrend: 'improving' | 'stable' | 'declining';
    scoreChangeRate: number;
    bestPeriod: { start: string; end: string; averageScore: number };
    attentionNeededPeriods: { start: string; end: string; reason: string }[];
  };
  topicPerformanceHeatmap: {
    topic: string;
    weeklyScores: { week: string; score: number }[];
  }[];
}

// Parent Panel - Communication
export interface TeacherFeedback {
  id: string;
  studentId: string;
  teacherId: string;
  teacherName: string;
  type: 'test_feedback' | 'general_feedback' | 'performance_note';
  relatedTestId?: string;
  relatedAssignmentId?: string;
  title: string;
  content: string;
  createdAt: string;
  read: boolean;
  readAt?: string;
}

// Parent Panel - Goals
export interface ParentGoal extends Goal {
  createdByParentId: string;
  reward?: string;
  completedAt?: string;
}

export interface ParentGoalProgress {
  goal: ParentGoal & { currentValue: number; progressPercent: number };
  dailyProgress: { date: string; value: number }[];
  estimatedCompletionDate?: string;
  onTrack: boolean;
}

// Parent Panel - Alerts
export interface Alert {
  id: string;
  studentId: string;
  type: 'low_activity' | 'performance_decline' | 'assignment_neglect';
  severity: 'low' | 'medium' | 'high';
  title: string;
  description: string;
  detectedAt: string;
  status: 'active' | 'resolved' | 'dismissed';
  resolvedAt?: string;
  relatedData?: {
    testsSolved?: number;
    averageScore?: number;
    overdueAssignments?: number;
  };
}

// Extended Notification types for parent
export type ParentNotificationType =
  | NotificationType
  | 'feedback_received'
  | 'low_activity'
  | 'low_performance';

export interface ParentNotification extends Omit<Notification, 'type'> {
  studentId?: string;
  type: ParentNotificationType;
}

// Student Detail Summary for parent view
export interface StudentDetailSummary {
  studentId: string;
  studentName: string;
  gradeLevel: string;
  className?: string;
  quickStats: {
    testsSolvedLast7Days: number;
    averageScorePercent: number;
    totalStudyMinutes: number;
    pendingAssignmentsCount: number;
    overdueAssignmentsCount: number;
  };
  recentActivities: {
    type: 'test' | 'content' | 'assignment';
    title: string;
    date: string;
  }[];
  upcomingAssignments: AssignmentActivityItem[];
  profilePictureUrl?: string;
}

