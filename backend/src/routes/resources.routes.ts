import { Router } from "express";
import {
  create,
  createVersion,
  getOne,
  getVersion,
  list,
  listVersions,
  remove,
  update,
  upload,
  uploadVersion,
} from "../controllers/resources.controller";

const router = Router();

router.get("/", list);
router.post("/", create);
router.get("/:id", getOne);
router.put("/:id", update);
router.delete("/:id", remove);

router.get("/:id/versions", listVersions);
router.get("/:id/versions/:versionId", getVersion);
router.post("/:id/versions", createVersion);

router.post("/:id/upload", upload.single("file"), uploadVersion);

export default router;
