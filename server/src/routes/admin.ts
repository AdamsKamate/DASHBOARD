import { Router, Request, Response } from "express";
import { requireAuth, requireAdmin } from "../middleware/auth";
import {
  listAllUsers,
  findUserForAdmin,
  countAdmins,
  updateUserRole,
  deleteUserAccount,
  listUserWidgetIds,
} from "../db/repositories/admin";
import { removeWidgetRefresh } from "../jobs/queue";

// User administration
const router = Router();

/*
 GET /admin/users
 Every account, with how many widgets and linked services each one has
*/
router.get("/admin/users", requireAuth, requireAdmin, async (_req: Request, res: Response) => {
  try {
    return res.json(await listAllUsers());
  } catch (error) {
    console.error("[admin] listing users failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

/*
 PATCH /admin/users/:id/role
 Promotes or demotes an account
*/
router.patch(
  "/admin/users/:id/role",
  requireAuth,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const { role } = req.body ?? {};
      if (role !== "user" && role !== "admin") {
        return res.status(400).json({
          error: "Invalid input",
          details: ["role must be either 'user' or 'admin'"],
        });
      }
      const target = await findUserForAdmin(req.params.id);
      if (!target) {
        return res.status(404).json({ error: "User not found" });
      }

      /*
       An administrator cannot demote themselves
      */
      if (target.id === req.user!.userId && role === "user") {
        return res.status(409).json({
          error: "Tu ne peux pas retirer ton propre rôle d'administrateur.",
        });
      }
      // And the last administrator cannot be demoted by another one either
      if (target.role === "admin" && role === "user" && (await countAdmins()) <= 1) {
        return res.status(409).json({
          error: "Impossible de retirer le dernier administrateur de la plateforme.",
        });
      }
      const updated = await updateUserRole(target.id, role);
      if (!updated) {
        // Deleted between the read and the write: rare, but a 404 is more
        // honest than a 500
        return res.status(404).json({ error: "User not found" });
      }
      return res.json(updated);
    } catch (error) {
      console.error("[admin] role update failed:", (error as Error).message);
      return res.status(500).json({ error: "Internal server error" });
    }
  }
);

/*
 DELETE /admin/users/:id
 Deletes an account, its widgets, its cached data and its linked services
*/
router.delete("/admin/users/:id", requireAuth, requireAdmin, async (req: Request, res: Response) => {
  try {
    const target = await findUserForAdmin(req.params.id);
    if (!target) {
      return res.status(404).json({ error: "User not found" });
    }
    /*
     Deleting your own account from here would log you out midrequest and
     leave the interface showing a list you can no longer read
    */
    if (target.id === req.user!.userId) {
      return res.status(409).json({
        error: "Tu ne peux pas supprimer ton propre compte depuis l'administration.",
      });
    }
    if (target.role === "admin" && (await countAdmins()) <= 1) {
      return res.status(409).json({
        error: "Impossible de supprimer le dernier administrateur de la plateforme.",
      });
    }

    /*
     The scheduled jobs are removed BEFORE the account
    */
    const widgetIds = await listUserWidgetIds(target.id);
    for (const widgetId of widgetIds) {
      await removeWidgetRefresh(widgetId);
    }
    const wasDeleted = await deleteUserAccount(target.id);
    if (!wasDeleted) {
      return res.status(404).json({ error: "User not found" });
    }
    console.log(
      `[admin] ${req.user!.email} deleted ${target.email} (${widgetIds.length} widget(s))`
    );
    return res.status(204).send();
  } catch (error) {
    console.error("[admin] user deletion failed:", (error as Error).message);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
