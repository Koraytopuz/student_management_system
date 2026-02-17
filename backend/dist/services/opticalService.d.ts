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
/**
 * Process a scanned OMR form using Python script
 */
export declare function processStandardOMR(imagePath: string, formType?: string): Promise<OMRResult>;
/**
 * Validate student number exists in database
 */
export declare function validateStudentNumber(studentNumber: string): Promise<{
    valid: boolean;
    studentId?: string;
    studentName?: string;
}>;
/**
 * Create exam result from OMR data
 */
export declare function createExamResultFromOMR(omrData: OMRResult, examId: number, studentId: string, answerKey?: {
    [subject: string]: string[];
}): Promise<any>;
/**
 * Create a processing job and return job ID
 */
export declare function createProcessingJob(examId: number, imagePath: string): string;
/**
 * Update processing job status
 */
export declare function updateProcessingJob(jobId: string, updates: Partial<OMRProcessingJob>): void;
/**
 * Get processing job status
 */
export declare function getProcessingJobStatus(jobId: string): OMRProcessingJob | undefined;
/**
 * Process OMR form asynchronously
 */
export declare function processOMRAsync(jobId: string, imagePath: string, formType: string, examId: number): Promise<void>;
//# sourceMappingURL=opticalService.d.ts.map