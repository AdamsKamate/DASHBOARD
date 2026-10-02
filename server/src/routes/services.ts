import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { listServices, listUserSubscriptions } from "../db/repositories/services";
import { unlinkService } from "../db/repositories/userServices";

const router = Router();

// Services available to a user, and their subscription state.

/*
 GET /services
 Authenticated: "subscribed" only means something for a given user.
 */
router.get("/services", requireAuth, async (req: Request, res: Response) => {
  try {
    // Two independent queries, sent together rather than one after the other.
    const [services, subscribedServiceIds] = await Promise.all([
      listServices(),
      listUserSubscriptions(req.user!.userId),
    ]);

    const subscribedIdSet = new Set(subscribedServiceIds);

    const result = services.map((service) => ({
      name: service.name,
      requiresAuth: service.requires_auth,
      // A service without authentication is available to everyone: it never
      // stores a subscription row, so looking for one would always answer
      // false. API.md states it must report true.
      subscribed: service.requires_auth ? subscribedIdSet.has(service.id) : true,
    }));

    return res.json(result);
  } catch (error) {
    console.error("[services] list failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 DELETE /services/:service/subscription
 */
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
