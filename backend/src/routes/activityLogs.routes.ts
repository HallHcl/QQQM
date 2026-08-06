import { Router } from "express";
import { list } from "../controllers/activityLogs.controller";

const router = Router();

router.get("/", list);

export default router;
