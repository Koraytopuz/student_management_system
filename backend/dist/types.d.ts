export type UserRole = 'teacher' | 'student' | 'parent' | 'admin';
export interface UserBase {
    id: string;
    name: string;
    email: string;
    role: UserRole;
}
export interface Teacher extends UserBase {
    role: 'teacher';
    subjectAreas: string[];
}
export interface Student extends UserBase {
    role: 'student';
    gradeLevel: string;
    classId: string;
}
export interface Parent extends UserBase {
    role: 'parent';
    studentIds: string[];
}
export interface Admin extends UserBase {
    role: 'admin';
}
export type User = Teacher | Student | Parent | Admin;
export interface ClassGroup {
    id: string;
    name: string;
    gradeLevel: string;
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
    text: string;
    createdAt: string;
    read: boolean;
}
export type NotificationType = 'assignment_created' | 'assignment_due_soon' | 'assignment_overdue' | 'test_result_ready' | 'meeting_scheduled' | 'weekly_summary';
export interface Notification {
    id: string;
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    createdAt: string;
    read: boolean;
}
export interface TeacherDashboardSummary {
    totalStudents: number;
    testsAssignedThisWeek: number;
    averageScoreLast7Days: number;
    recentActivity: string[];
}
export interface StudentDashboardSummary {
    pendingAssignmentsCount: number;
    testsSolvedThisWeek: number;
    totalQuestionsThisWeek: number;
    averageScorePercent: number;
    lastWatchedContents: {
        contentId: string;
        title: string;
        lastPositionSeconds: number;
    }[];
}
export interface ParentDashboardSummaryStudentCard {
    studentId: string;
    studentName: string;
    testsSolvedLast7Days: number;
    averageScorePercent: number;
    totalStudyMinutes: number;
}
export interface ParentDashboardSummary {
    children: ParentDashboardSummaryStudentCard[];
}
//# sourceMappingURL=types.d.ts.map