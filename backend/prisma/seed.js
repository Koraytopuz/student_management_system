"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
const bcrypt_1 = __importDefault(require("bcrypt"));
const url = process.env.DATABASE_URL;
if (!url)
    throw new Error('DATABASE_URL is required');
const pool = new pg_1.Pool({ connectionString: url });
const adapter = new adapter_pg_1.PrismaPg(pool);
const prisma = new client_1.PrismaClient({ adapter });
const DEMO_PASSWORD = 'password123';
async function main() {
    const passwordHash = await bcrypt_1.default.hash(DEMO_PASSWORD, 10);
    // Admin
    const admin = await prisma.user.upsert({
        where: { email_role: { email: 'admin@example.com', role: 'admin' } },
        create: {
            name: 'Yönetici',
            email: 'admin@example.com',
            role: 'admin',
            passwordHash,
        },
        update: {},
    });
    // Teacher
    const teacher = await prisma.user.upsert({
        where: { email_role: { email: 'ayse.teacher@example.com', role: 'teacher' } },
        create: {
            name: 'Ayşe Öğretmen',
            email: 'ayse.teacher@example.com',
            role: 'teacher',
            passwordHash,
            subjectAreas: ['Matematik', 'Geometri'],
        },
        update: {},
    });
    // Students
    const student1 = await prisma.user.upsert({
        where: { email_role: { email: 'ali.student@example.com', role: 'student' } },
        create: {
            name: 'Ali Öğrenci',
            email: 'ali.student@example.com',
            role: 'student',
            passwordHash,
            gradeLevel: '9',
            classId: '', // will set after class group
        },
        update: {},
    });
    const student2 = await prisma.user.upsert({
        where: { email_role: { email: 'zeynep.student@example.com', role: 'student' } },
        create: {
            name: 'Zeynep Öğrenci',
            email: 'zeynep.student@example.com',
            role: 'student',
            passwordHash,
            gradeLevel: '9',
            classId: '',
        },
        update: {},
    });
    // Parent
    const parent = await prisma.user.upsert({
        where: { email_role: { email: 'mehmet.parent@example.com', role: 'parent' } },
        create: {
            name: 'Mehmet Veli',
            email: 'mehmet.parent@example.com',
            role: 'parent',
            passwordHash,
        },
        update: {},
    });
    // Subjects
    const subject1 = await prisma.subject.upsert({
        where: { id: 'sub1' },
        create: { id: 'sub1', name: 'Matematik' },
        update: {},
    });
    const subject2 = await prisma.subject.upsert({
        where: { id: 'sub2' },
        create: { id: 'sub2', name: 'Fizik' },
        update: {},
    });
    // Class group
    const classGroup = await prisma.classGroup.upsert({
        where: { id: 'c1' },
        create: {
            id: 'c1',
            name: '9A',
            gradeLevel: '9',
            teacherId: teacher.id,
            students: {
                create: [
                    { studentId: student1.id },
                    { studentId: student2.id },
                ],
            },
        },
        update: {},
    });
    // Update students with classId
    await prisma.user.updateMany({
        where: { id: { in: [student1.id, student2.id] } },
        data: { classId: classGroup.id },
    });
    // Parent-Student links
    await prisma.parentStudent.upsert({
        where: { parentId_studentId: { parentId: parent.id, studentId: student1.id } },
        create: { parentId: parent.id, studentId: student1.id },
        update: {},
    });
    await prisma.parentStudent.upsert({
        where: { parentId_studentId: { parentId: parent.id, studentId: student2.id } },
        create: { parentId: parent.id, studentId: student2.id },
        update: {},
    });
    // Content
    const content1 = await prisma.contentItem.upsert({
        where: { id: 'cnt1' },
        create: {
            id: 'cnt1',
            title: 'Denklemlere Giriş',
            description: 'Lineer denklemlere giriş videosu',
            type: 'video',
            subjectId: subject1.id,
            topic: 'Denklemler',
            gradeLevel: '9',
            durationMinutes: 20,
            tags: ['Denklemler', '9. Sınıf Matematik'],
            url: 'https://example.com/videos/denklemler-giris',
            classGroups: { create: [{ classGroupId: classGroup.id }] },
        },
        update: {},
    });
    const content2 = await prisma.contentItem.upsert({
        where: { id: 'cnt2' },
        create: {
            id: 'cnt2',
            title: 'Üslü Sayılar Konu Anlatım PDF',
            description: 'Üslü sayılar konusu için pdf konu anlatımı',
            type: 'document',
            subjectId: subject1.id,
            topic: 'Üslü Sayılar',
            gradeLevel: '9',
            tags: ['Üslü Sayılar', '9. Sınıf Matematik'],
            url: '/pdfs/matematik_pdf.pdf',
            classGroups: { create: [{ classGroupId: classGroup.id }] },
        },
        update: {},
    });
    // Test
    const test = await prisma.test.upsert({
        where: { id: 'test1' },
        create: {
            id: 'test1',
            title: 'Denklemler – Test 1',
            subjectId: subject1.id,
            topic: 'Denklemler',
            createdByTeacherId: teacher.id,
            questions: {
                create: [
                    {
                        id: 'q1',
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
                        text: "Doğru mu, yanlış mı? 3x = 12 ise x = 4.",
                        type: 'true_false',
                        correctAnswer: 'true',
                        solutionExplanation: '3x = 12 ⇒ x = 4, ifade doğrudur.',
                        topic: 'Denklemler',
                        difficulty: 'easy',
                    },
                ],
            },
        },
        update: {},
    });
    // Assignment
    const dueDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const assignment = await prisma.assignment.upsert({
        where: { id: 'a1' },
        create: {
            id: 'a1',
            title: 'Denklemler Konusundan 2 Test Görevi',
            description: 'Denklemler konusunu pekiştirmek için test görevi',
            testId: test.id,
            contentId: content1.id,
            classId: classGroup.id,
            dueDate,
            points: 100,
            students: {
                create: [{ studentId: student1.id }, { studentId: student2.id }],
            },
        },
        update: {},
    });
    // Test result (demo)
    await prisma.testResult.upsert({
        where: { id: 'tr1' },
        create: {
            id: 'tr1',
            assignmentId: assignment.id,
            studentId: student1.id,
            testId: test.id,
            correctCount: 3,
            incorrectCount: 0,
            blankCount: 0,
            scorePercent: 100,
            durationSeconds: 480,
            completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
            answers: {
                create: [
                    { questionId: 'q1', answer: 'x = 2', isCorrect: true },
                    { questionId: 'q2', answer: '15', isCorrect: true },
                    { questionId: 'q3', answer: 'true', isCorrect: true },
                ],
            },
        },
        update: {},
    });
    // Meeting
    await prisma.meeting.upsert({
        where: { id: 'm1' },
        create: {
            id: 'm1',
            type: 'class',
            title: 'Denklemler Tekrar Dersi',
            teacherId: teacher.id,
            scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
            durationMinutes: 45,
            meetingUrl: 'https://meet.example.com/denklemler-9a',
            students: {
                create: [{ studentId: student1.id }, { studentId: student2.id }],
            },
        },
        update: {},
    });
    console.log('Seed tamamlandı. Demo kullanıcılar (şifre: ' + DEMO_PASSWORD + '):');
    console.log('  Admin: admin@example.com');
    console.log('  Öğretmen: ayse.teacher@example.com');
    console.log('  Öğrenci: ali.student@example.com, zeynep.student@example.com');
    console.log('  Veli: mehmet.parent@example.com');
}
main()
    .catch((e) => {
    console.error(e);
    process.exit(1);
})
    .finally(async () => {
    await prisma.$disconnect();
});
//# sourceMappingURL=seed.js.map