import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { listServices, listUserSubscriptions } from "../db/repositories/services";
import { unlinkService } from "../db/repositories/userServices";

const router = Router();

// Services available to a user, and their subscription state.
router.get("/services", requireAuth, async (req: Request, res: Response) => {
  try {
    const [services, subscribedServiceIds] = await Promise.all([
      listServices(),
      listUserSubscriptions(req.user!.userId),
    ]);

    const subscribedIdSet = new Set(subscribedServiceIds);
    const result = services.map((service) => ({
      name: service.name,
      requiresAuth: service.requires_auth,
      subscribed: service.requires_auth ? subscribedIdSet.has(service.id) : true,
    }));

    return res.json(result);
  } catch (error) {
    console.error("[services] list failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// Unlink a service. Repeating the request is intentionally harmless.
router.delete(
  "/services/:service/subscription",
  requireAuth,
  async (req: Request, res: Response) => {
    const serviceName = req.params.service;

    try {
      const wasLinked = await unlinkService(req.user!.userId, serviceName);

      if (wasLinked) {
        console.log(`[services] ${serviceName} unlinked from user ${req.user!.userId}`);
      }
      return res.status(204).send();
    } catch (error) {
      console.error("[services] unlink failed:", (error as Error).message);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

export default router;
