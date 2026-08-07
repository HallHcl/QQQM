import { Router } from "express";
import { requireAnyRole, requireRole } from "../middleware/rbac";
import { create, getOne, list, remove, restore, update } from "../controllers/servers.controller";
import {
  createForServer as createCredentialReferenceForServer,
  listByServer as listCredentialReferencesByServer,
} from "../controllers/credentialReferences.controller";

const router = Router();

router.get("/", list);
router.post("/", requireAnyRole(["admin", "member"]), create);
router.get("/:id", getOne);
router.patch("/:id", requireAnyRole(["admin", "member"]), update);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

router.get("/:serverId/credential-references", listCredentialReferencesByServer);
router.post(
  "/:serverId/credential-references",
  requireAnyRole(["admin", "member"]),
  createCredentialReferenceForServer
);

export default router;
