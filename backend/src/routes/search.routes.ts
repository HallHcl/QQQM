import { Router } from "express";
import { search } from "../controllers/search.controller";

const router = Router();

// Read-only. No RBAC beyond authentication: search returns only rows the
// user could already reach from the list pages, and every branch filters
// soft-deleted rows out.
router.get("/", search);

export default router;
