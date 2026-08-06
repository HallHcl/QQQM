import { Router } from "express";
import {
  addClient,
  create,
  getOne,
  list,
  listClients,
  remove,
  removeClient,
  update,
} from "../controllers/people.controller";

const router = Router();

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.delete("/:id", remove);

router.get("/:id/clients", listClients);
router.post("/:id/clients", addClient);
router.delete("/:id/clients/:clientId", removeClient);

export default router;
