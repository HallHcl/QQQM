import { Router } from "express";
import {
  create,
  list,
  remove,
  update,
} from "../controllers/credentialReferences.controller";

const router = Router();

router.get("/", list);
router.post("/", create);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
