import { Router } from "express";
import { requireAnyRole } from "../middleware/rbac";
import { add, list, remove } from "../controllers/projectPeople.controller";

const router = Router();

router.get("/:id/people", list);
router.post("/:id/people", requireAnyRole(["admin", "member"]), add);
router.delete("/:id/people/:peopleId", requireAnyRole(["admin", "member"]), remove);

export default router;
