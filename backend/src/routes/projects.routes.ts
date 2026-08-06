import { Router } from "express";
import { create, getOne, list, remove, update } from "../controllers/projects.controller";

const router = Router();

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.delete("/:id", remove);

export default router;
