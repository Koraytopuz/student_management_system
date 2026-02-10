/**
 * Öğrencinin bağlı olduğu velilere bildirim gönderir.
 * Mevcut NotificationService yapısını kullanır (prisma.notification.create).
 */
export declare function notifyParentsOfStudent(studentId: string, notification: {
    type: 'exam_result_to_parent' | 'live_class_attendance';
    title: string;
    body: string;
    relatedEntityType?: 'test' | 'meeting' | 'attendance' | null;
    relatedEntityId?: string;
}): Promise<void>;
//# sourceMappingURL=notificationService.d.ts.map