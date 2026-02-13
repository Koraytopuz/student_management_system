import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../db';

const execAsync = promisify(exec);

// Types for OMR processing
export interface OMRResult {
    success: boolean;
    student_number_detected?: string;
    answers?: {
        [subject: string]: string[];
    };
    confidence_score?: number;
    student_number_confidence?: number;
    answers_confidence?: number;
    image_path?: string;
    alignment_found?: boolean;
    error?: string;
}

export interface OMRProcessingJob {
    id: string;
    examId: number;
    imagePath: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    studentNumber?: string;
    confidence?: number;
    rawData?: any;
    errorMessage?: string;
}

// In-memory job storage (in production, use database)
const processingJobs = new Map<string, OMRProcessingJob>();

/**
 * Process a scanned OMR form using Python script
 */
export async function processStandardOMR(
    imagePath: string,
    formType: string = 'YKS_STANDARD'
): Promise<OMRResult> {
    try {
        const scriptPath = path.join(__dirname, '../../python-scripts/standard_omr.py');
        const configPath = path.join(__dirname, '../../python-scripts/omr_config.json');
        const outputDir = path.join(__dirname, '../../uploads/omr-processed');

        // Ensure output directory exists
        await fs.mkdir(outputDir, { recursive: true });

        // Check if Python script exists
        try {
            await fs.access(scriptPath);
        } catch {
            throw new Error('OMR Python script not found');
        }

        // Execute Python script
        const command = `python "${scriptPath}" "${imagePath}" "${formType}" "${configPath}" "${outputDir}"`;

        const { stdout, stderr } = await execAsync(command, {
            timeout: 30000, // 30 second timeout
            maxBuffer: 1024 * 1024 * 10 // 10MB buffer
        });

        if (stderr && !stderr.includes('Warning')) {
            console.error('OMR Processing stderr:', stderr);
        }

        // Parse JSON output
        const result: OMRResult = JSON.parse(stdout.trim());

        return result;
    } catch (error: any) {
        console.error('Error processing OMR:', error);
        return {
            success: false,
            error: error.message || 'Unknown error during OMR processing'
        };
    }
}

/**
 * Validate student number exists in database
 */
export async function validateStudentNumber(studentNumber: string): Promise<{
    valid: boolean;
    studentId?: string;
    studentName?: string;
}> {
    try {
        // Try to find student by ID (student number is the user ID)
        const student = await prisma.user.findFirst({
            where: {
                role: 'student',
                id: studentNumber
            },
            select: {
                id: true,
                name: true,
                email: true
            }
        });

        if (student) {
            return {
                valid: true,
                studentId: student.id,
                studentName: student.name
            };
        }

        return { valid: false };
    } catch (error) {
        console.error('Error validating student number:', error);
        return { valid: false };
    }
}

/**
 * Create exam result from OMR data
 */
export async function createExamResultFromOMR(
    omrData: OMRResult,
    examId: number,
    studentId: string,
    answerKey?: { [subject: string]: string[] }
): Promise<any> {
    try {
        if (!omrData.success || !omrData.answers) {
            throw new Error('Invalid OMR data');
        }

        // Calculate scores if answer key is provided
        const details: any[] = [];
        let totalCorrect = 0;
        let totalWrong = 0;
        let totalEmpty = 0;

        for (const [subject, studentAnswers] of Object.entries(omrData.answers)) {
            let correct = 0;
            let wrong = 0;
            let empty = 0;

            studentAnswers.forEach((answer, index) => {
                if (!answer || answer === '') {
                    empty++;
                } else if (answerKey && answerKey[subject] && answerKey[subject][index] === answer) {
                    correct++;
                } else if (answerKey && answerKey[subject]) {
                    wrong++;
                }
            });

            const net = correct - (wrong * 0.25); // Standard YKS/LGS calculation

            totalCorrect += correct;
            totalWrong += wrong;
            totalEmpty += empty;

            details.push({
                lessonId: subject.toLowerCase(),
                lessonName: subject,
                correct,
                wrong,
                empty,
                net,
                topicAnalyses: {
                    create: [] // Can be expanded with topic-level analysis
                }
            });
        }

        const totalNet = totalCorrect - (totalWrong * 0.25);

        // Create exam result
        const examResult = await prisma.examResult.create({
            data: {
                studentId,
                examId,
                totalNet,
                score: totalNet * 5, // Simple scoring, adjust as needed
                percentile: 0, // Can be calculated based on class performance
                details: {
                    create: details
                }
            },
            include: {
                details: {
                    include: {
                        topicAnalyses: true
                    }
                }
            }
        });

        return examResult;
    } catch (error) {
        console.error('Error creating exam result from OMR:', error);
        throw error;
    }
}

/**
 * Create a processing job and return job ID
 */
export function createProcessingJob(examId: number, imagePath: string): string {
    const jobId = `omr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const job: OMRProcessingJob = {
        id: jobId,
        examId,
        imagePath,
        status: 'PENDING'
    };

    processingJobs.set(jobId, job);
    return jobId;
}

/**
 * Update processing job status
 */
export function updateProcessingJob(
    jobId: string,
    updates: Partial<OMRProcessingJob>
): void {
    const job = processingJobs.get(jobId);
    if (job) {
        Object.assign(job, updates);
        processingJobs.set(jobId, job);
    }
}

/**
 * Get processing job status
 */
export function getProcessingJobStatus(jobId: string): OMRProcessingJob | undefined {
    return processingJobs.get(jobId);
}

/**
 * Process OMR form asynchronously
 */
export async function processOMRAsync(
    jobId: string,
    imagePath: string,
    formType: string,
    examId: number
): Promise<void> {
    try {
        updateProcessingJob(jobId, { status: 'PROCESSING' });

        // Process the form
        const omrResult = await processStandardOMR(imagePath, formType);

        if (!omrResult.success) {
            updateProcessingJob(jobId, {
                status: 'FAILED',
                errorMessage: omrResult.error
            });
            return;
        }

        // Validate student number
        const validation = await validateStudentNumber(omrResult.student_number_detected || '');

        updateProcessingJob(jobId, {
            status: 'COMPLETED',
            studentNumber: omrResult.student_number_detected,
            confidence: omrResult.confidence_score,
            rawData: omrResult
        });

        // If student is valid and confidence is high, auto-create exam result
        if (validation.valid && omrResult.confidence_score && omrResult.confidence_score > 0.85) {
            // Auto-create exam result (answer key would need to be fetched)
            // This can be implemented based on your exam structure
        }

    } catch (error: any) {
        updateProcessingJob(jobId, {
            status: 'FAILED',
            errorMessage: error.message
        });
    }
}
