import { Router } from "express";
import { requireAnyRole, requireRole } from "../middleware/rbac";
import {
  addClient,
  create,
  getOne,
  list,
  listClients,
  remove,
  removeClient,
  restore,
  update,
} from "../controllers/people.controller";

const router = Router();

router.get("/", list);
router.post("/", requireAnyRole(["admin", "member"]), create);
router.get("/:id", getOne);
router.patch("/:id", requireAnyRole(["admin", "member"]), update);
router.delete("/:id", requireRole("admin"), remove);
router.post("/:id/restore", requireRole("admin"), restore);

router.get("/:id/clients", listClients);
router.post("/:id/clients", requireAnyRole(["admin", "member"]), addClient);
router.delete("/:id/clients/:clientId", requireAnyRole(["admin", "member"]), removeClient);

export default router;
