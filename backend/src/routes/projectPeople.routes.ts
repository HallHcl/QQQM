import { Router } from "express";
import { add, list, remove } from "../controllers/projectPeople.controller";

const router = Router();

router.get("/:id/people", list);
router.post("/:id/people", add);
router.delete("/:id/people/:peopleId", remove);

export default router;
