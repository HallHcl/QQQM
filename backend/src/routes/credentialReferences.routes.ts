import { Router } from "express";
import { requireAnyRole, requireRole } from "../middleware/rbac";
import { getOne, remove, update } from "../controllers/credentialReferences.controller";

const router = Router();

router.get("/:id", getOne);
router.patch("/:id", requireAnyRole(["admin", "member"]), update);
router.delete("/:id", requireRole("admin"), remove);

export default router;
