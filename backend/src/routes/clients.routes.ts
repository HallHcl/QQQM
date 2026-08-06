import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import { create, getOne, list, remove, update } from "../controllers/clients.controller";

const router = Router();

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.delete("/:id", requireRole("admin"), remove);

export default router;
