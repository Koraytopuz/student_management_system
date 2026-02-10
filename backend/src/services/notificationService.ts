import { prisma } from '../db';

/**
 * Öğrencinin bağlı olduğu velilere bildirim gönderir.
 * Mevcut NotificationService yapısını kullanır (prisma.notification.create).
 */
export async function notifyParentsOfStudent(
  studentId: string,
  notification: {
    type: 'exam_result_to_parent' | 'live_class_attendance';
    title: string;
    body: string;
    relatedEntityType?: 'test' | 'meeting' | 'attendance' | null;
    relatedEntityId?: string;
  },
): Promise<void> {
  try {
    const parentLinks = await prisma.parentStudent.findMany({
      where: { studentId },
      select: { parentId: true },
    });

    if (parentLinks.length === 0) return;

    const parentIds = parentLinks.map((ps) => ps.parentId);

    await prisma.notification.createMany({
      data: parentIds.map((parentId) => ({
        userId: parentId,
        type: notification.type as any,
        title: notification.title,
        body: notification.body,
        read: false,
        relatedEntityType: notification.relatedEntityType as any ?? null,
        relatedEntityId: notification.relatedEntityId ?? null,
      })),
    });
  } catch (err) {
    // Log but don't fail the main operation
    console.error('[notificationService] notifyParentsOfStudent error:', err);
  }
}
