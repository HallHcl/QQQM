import { Router } from "express";
import { auth } from "../middleware/auth";
import { changePassword, login, logout, me } from "../controllers/auth.controller";

const router = Router();

router.post("/login", login);
router.get("/me", auth, me);
router.post("/logout", auth, logout);
router.post("/change-password", auth, changePassword);

export default router;
