import {
  Admin,
  Alert,
  Assignment,
  ClassGroup,
  ContentItem,
  CustomReport,
  Goal,
  Meeting,
  Message,
  MonthlyReport,
  Notification,
  Parent,
  ParentGoal,
  Question,
  Student,
  Subject,
  Teacher,
  TeacherFeedback,
  Test,
  TestResult,
  TodoItem,
  User,
  WatchRecord,
  WeeklyReport,
} from './types';

// Basit in-memory veri deposu (demo amaçlıdır, kalıcı değildir)

export const admins: Admin[] = [
  {
    id: 'a1',
    name: 'Yönetici',
    email: 'admin@example.com',
    role: 'admin',
  },
];

export const teachers: Teacher[] = [
  {
    id: 't1',
    name: 'Ayşe Öğretmen',
    email: 'ayse.teacher@example.com',
    role: 'teacher',
    subjectAreas: ['Matematik', 'Geometri'],
  },
];

export const students: Student[] = [
  {
    id: 's1',
    name: 'Ali Öğrenci',
    email: 'ali.student@example.com',
    role: 'student',
    gradeLevel: '9',
    classId: 'c1',
  },
  {
    id: 's2',
    name: 'Zeynep Öğrenci',
    email: 'zeynep.student@example.com',
    role: 'student',
    gradeLevel: '9',
    classId: 'c1',
  },
];

export const parents: Parent[] = [
  {
    id: 'p1',
    name: 'Mehmet Veli',
    email: 'mehmet.parent@example.com',
    role: 'parent',
    studentIds: ['s1', 's2'],
  },
];

export const subjects: Subject[] = [
  { id: 'sub1', name: 'Matematik' },
  { id: 'sub2', name: 'Fizik' },
];

export const classGroups: ClassGroup[] = [
  {
    id: 'c1',
    name: '9A',
    gradeLevel: '9',
    teacherId: 't1',
    studentIds: students.map((s) => s.id),
  },
];

export const contents: ContentItem[] = [
  {
    id: 'cnt1',
    title: 'Denklemlere Giriş',
    description: 'Lineer denklemlere giriş videosu',
    type: 'video',
    subjectId: 'sub1',
    topic: 'Denklemler',
    gradeLevel: '9',
    durationMinutes: 20,
    tags: ['Denklemler', '9. Sınıf Matematik'],
    url: 'https://example.com/videos/denklemler-giris',
    assignedToClassIds: ['c1'],
    assignedToStudentIds: [],
  },
];

export const tests: Test[] = [
  {
    id: 'test1',
    title: 'Denklemler – Test 1',
    subjectId: 'sub1',
    topic: 'Denklemler',
    questionIds: ['q1', 'q2', 'q3'],
    createdByTeacherId: 't1',
  },
];

export const questions: Question[] = [
  {
    id: 'q1',
    testId: 'test1',
    text: '2x + 3 = 7 denkleminin çözümü nedir?',
    type: 'multiple_choice',
    choices: ['x = 1', 'x = 2', 'x = 3', 'x = 4'],
    correctAnswer: 'x = 2',
    solutionExplanation: '2x + 3 = 7 ⇒ 2x = 4 ⇒ x = 2',
    topic: 'Denklemler',
    difficulty: 'easy',
  },
  {
    id: 'q2',
    testId: 'test1',
    text: 'x - 5 = 10 ise x kaçtır?',
    type: 'multiple_choice',
    choices: ['10', '15', '5', '20'],
    correctAnswer: '15',
    solutionExplanation: 'x - 5 = 10 ⇒ x = 15',
    topic: 'Denklemler',
    difficulty: 'easy',
  },
  {
    id: 'q3',
    testId: 'test1',
    text: 'Doğru mu, yanlış mı? 3x = 12 ise x = 4.',
    type: 'true_false',
    correctAnswer: 'true',
    solutionExplanation: '3x = 12 ⇒ x = 4, ifade doğrudur.',
    topic: 'Denklemler',
    difficulty: 'easy',
  },
];

export const assignments: Assignment[] = [
  {
    id: 'a1',
    title: 'Denklemler Konusundan 2 Test Görevi',
    description: 'Denklemler konusunu pekiştirmek için test görevi',
    testId: 'test1',
    contentId: 'cnt1',
    classId: 'c1',
    assignedStudentIds: students.map((s) => s.id),
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    points: 100,
  },
];

export const testResults: TestResult[] = [];

export const watchRecords: WatchRecord[] = [];

export const meetings: Meeting[] = [
  {
    id: 'm1',
    type: 'class',
    title: 'Denklemler Tekrar Dersi',
    teacherId: 't1',
    studentIds: students.map((s) => s.id),
    parentIds: [],
    scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
    durationMinutes: 45,
    meetingUrl: 'https://meet.example.com/denklemler-9a',
  },
];

export const messages: Message[] = [];

export const notifications: Notification[] = [];

export const todos: TodoItem[] = [];

export const goals: Goal[] = [];

export const parentGoals: ParentGoal[] = [];

export const teacherFeedbacks: TeacherFeedback[] = [];

export const alerts: Alert[] = [];

export const weeklyReports: WeeklyReport[] = [];

export const monthlyReports: MonthlyReport[] = [];

export const customReports: CustomReport[] = [];

export const allUsers = (): User[] => [
  ...admins,
  ...teachers,
  ...students,
  ...parents,
];

