"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.notifyParentsOfStudent = notifyParentsOfStudent;
const db_1 = require("../db");
/**
 * Öğrencinin bağlı olduğu velilere bildirim gönderir.
 * Mevcut NotificationService yapısını kullanır (prisma.notification.create).
 */
async function notifyParentsOfStudent(studentId, notification) {
    try {
        const parentLinks = await db_1.prisma.parentStudent.findMany({
            where: { studentId },
            select: { parentId: true },
        });
        if (parentLinks.length === 0)
            return;
        const parentIds = parentLinks.map((ps) => ps.parentId);
        await db_1.prisma.notification.createMany({
            data: parentIds.map((parentId) => {
                var _a, _b;
                return ({
                    userId: parentId,
                    type: notification.type,
                    title: notification.title,
                    body: notification.body,
                    read: false,
                    relatedEntityType: (_a = notification.relatedEntityType) !== null && _a !== void 0 ? _a : null,
                    relatedEntityId: (_b = notification.relatedEntityId) !== null && _b !== void 0 ? _b : null,
                });
            }),
        });
    }
    catch (err) {
        // Log but don't fail the main operation
        console.error('[notificationService] notifyParentsOfStudent error:', err);
    }
}
//# sourceMappingURL=notificationService.js.map