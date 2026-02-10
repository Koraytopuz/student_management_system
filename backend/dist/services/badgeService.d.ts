import type { StudentBadgeProgress } from '../types';
export type BadgeMetricKey = 'total_questions_all_time' | 'tests_completed_all_time' | 'assignments_completed_all_time' | 'content_completed_all_time' | 'longest_active_streak_days' | 'focus_xp_total';
export declare function getStudentBadgeProgress(studentId: string): Promise<StudentBadgeProgress[]>;
//# sourceMappingURL=badgeService.d.ts.map