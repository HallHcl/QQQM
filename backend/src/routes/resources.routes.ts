import { Router } from "express";
import { requireAnyRole, requireRole } from "../middleware/rbac";
import {
  create,
  createVersionHandler,
  getOne,
  getVersionHandler,
  list,
  listVersionsHandler,
  remove,
  restore,
  updateMetadataHandler,
} from "../controllers/resources.controller";

const router = Router();

router.get("/", list);
router.post("/", requireAnyRole(["admin", "member"]), create);
router.get("/:id", getOne);
router.patch("/:id", requireRole("admin"), updateMetadataHandler);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

router.get("/:id/versions", listVersionsHandler);
router.get("/:id/versions/:versionId", getVersionHandler);
router.post("/:id/versions", requireAnyRole(["admin", "member"]), createVersionHandler);

export default router;
