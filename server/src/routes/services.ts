import { Router, Request, Response } from "express";
import { requireAuth } from "../middleware/auth";
import { listServices, listUserSubscriptions } from "../db/repositories/services";
import { unlinkService } from "../db/repositories/userServices";

const router = Router();

router.get("/services", requireAuth, async (req: Request, res: Response) => {
  try {
    const [services, subscribedIds] = await Promise.all([
      listServices(),
      listUserSubscriptions(req.user!.userId),
    ]);
    const subscribedSet = new Set(subscribedIds);
    const result = services.map((service) => ({
      name: service.name,
      requiresAuth: service.requires_auth,
      subscribed: subscribedSet.has(service.id),
    }));
    return res.json(result);
  } catch (err) {
    console.error("[services] list failed:", (err as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/services/:service/subscription", requireAuth, async (req: Request, res: Response) => {
  try {
    const removed = await unlinkService(req.user!.userId, req.params.service);
    if (!removed) {
      return res.status(404).json({ error: "Not linked" });
    }
    return res.status(204).send();
  } catch (err) {
    console.error("[services] unlink failed:", (err as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
