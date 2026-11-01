import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { prisma } from "../../config/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateQuery } from "../../middleware/validate.js";

const router = Router();

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

router.use(requireAuth);

/**
 * GET /api/notifications
 * The signed-in user's own notifications, newest first, plus their unread count.
 * Scoped by user id from the verified token only: there is no way to ask for another user's.
 */
router.get("/", validateQuery(listQuerySchema), async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const { limit } = (req as Request & { validatedQuery: z.infer<typeof listQuerySchema> }).validatedQuery;

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: limit,
        select: {
          id: true,
          title: true,
          message: true,
          type: true,
          entityType: true,
          entityId: true,
          isRead: true,
          createdAt: true,
        },
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    res.status(200).json({ success: true, data: { items, unreadCount } });
  } catch (error) {
    console.error("[Notifications] Failed to load notifications:", error);
    res.status(500).json({
      success: false,
      code: "INTERNAL_SERVER_ERROR",
      message: "Could not load notifications",
    });
  }
});

export default router;
