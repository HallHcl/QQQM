import { Router } from "express";
import { requireAnyRole, requireRole } from "../middleware/rbac";
import { create, getOne, list, remove, restore, update } from "../controllers/schedules.controller";

const router = Router();

router.get("/", list);
router.post("/", requireAnyRole(["admin", "member"]), create);
router.get("/:id", getOne);
router.patch("/:id", requireAnyRole(["admin", "member"]), update);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

export default router;
