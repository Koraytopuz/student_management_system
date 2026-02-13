
import { prisma } from '../db';


async function main() {
    console.log('Connecting to database...');

    // 1. Find a subject
    const subject = await prisma.subject.findFirst();
    if (!subject) {
        console.error('No subject found in database. Please seed the database first.');
        return;
    }
    console.log(`Found subject: ${subject.name} (${subject.id})`);

    // 2. Mock data similar to what `aiRoutes.ts` produces
    const mockQuestions = [
        {
            subjectId: subject.id,
            gradeLevel: '9', // Assuming 9th grade
            topic: 'Test Topic',
            text: 'This is a test question from the reproduction script.',
            type: 'multiple_choice' as const,
            choices: ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: 'A',
            difficulty: 'medium', // easy | medium | hard
            bloomLevel: null,
            subtopic: null,
            kazanimKodu: null,
            estimatedMinutes: null,
            solutionExplanation: null,
            source: 'import' as const,
            createdByTeacherId: null,
            isApproved: true,
            approvedByTeacherId: null,
            qualityScore: null,
            usageCount: 0,
            tags: [] as string[],
        }
    ];

    console.log('Attempting to create questions in QuestionBank...');

    try {
        const result = await prisma.questionBank.createMany({
            data: mockQuestions,
        });
        console.log('Success! Created count:', result.count);
    } catch (error) {
        console.error('Error creating questions:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main();
