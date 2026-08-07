import { Router } from "express";
import { requireRole } from "../middleware/rbac";
import {
  create,
  getOne,
  list,
  listPeople,
  remove,
  restore,
  update,
} from "../controllers/clients.controller";

const router = Router();

router.get("/", list);
router.post("/", requireRole("admin"), create);
router.get("/:id", getOne);
router.patch("/:id", update);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

router.get("/:id/people", listPeople);

export default router;
