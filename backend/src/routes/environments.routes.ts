import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { create, getOne, list, remove, restore, update } from "../controllers/environments.controller";

const router = Router();

router.get("/", list);
router.post("/", requireRole("admin"), create);
router.get("/:id", getOne);
router.patch("/:id", requireRole("admin"), update);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

export default router;
