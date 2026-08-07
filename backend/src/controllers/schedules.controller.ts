import { Request, Response } from "express";
import { ApiError } from "../middleware/errorHandler";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createScheduleSchema,
  updateScheduleSchema,
} from "../validators/schedules.validator";
import {
  createSchedule,
  getScheduleById,
  listSchedules,
  ListSchedulesParams,
  restoreSchedule,
  softDeleteSchedule,
  updateSchedule,
} from "../services/schedules.service";

const SORTABLE_COLUMNS = new Set(["scheduled_date", "created_at", "updated_at"]);
const DELETED_MODES = new Set(["false", "true", "all"]);
const AUTO_FIELDS = ["started_at", "completed_at"];

function parseListQuery(req: Request): ListSchedulesParams {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
  const perPage = Math.min(
    100,
    Math.max(1, parseInt(String(req.query.per_page ?? "20"), 10) || 20)
  );
  const sortParam = String(req.query.sort ?? "scheduled_date");
  const sort = SORTABLE_COLUMNS.has(sortParam) ? sortParam : "scheduled_date";
  const order = String(req.query.order ?? "asc").toLowerCase() === "desc" ? "desc" : "asc";
  const projectId = typeof req.query.project_id === "string" && req.query.project_id.length > 0
    ? req.query.project_id
    : undefined;
  const status = typeof req.query.status === "string" && req.query.status.length > 0
    ? req.query.status
    : undefined;
  const from = typeof req.query.from === "string" && req.query.from.length > 0
    ? req.query.from
    : undefined;
  const to = typeof req.query.to === "string" && req.query.to.length > 0 ? req.query.to : undefined;
  const deletedParam = String(req.query.deleted ?? "false");
  const deletedMode = (DELETED_MODES.has(deletedParam) ? deletedParam : "false") as
    | "false"
    | "true"
    | "all";

  return { page, perPage, sort, order, projectId, status, from, to, deletedMode };
}

export async function list(req: Request, res: Response) {
  const result = await listSchedules(parseListQuery(req));
  res.json(result);
}

export async function getOne(req: Request, res: Response) {
  const schedule = await getScheduleById(paramId(req, "id"));
  res.json(schedule);
}

export async function create(req: Request, res: Response) {
  const parseResult = createScheduleSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const created = await createSchedule(parseResult.data, changedBy);
  res.status(201).json(created);
}

export async function update(req: Request, res: Response) {
  const body = req.body ?? {};
  const offendingField = AUTO_FIELDS.find((field) =>
    Object.prototype.hasOwnProperty.call(body, field)
  );
  if (offendingField) {
    throw new ApiError(
      400,
      "started_at/completed_at are set automatically and cannot be provided directly",
      "VALIDATION_ERROR",
      { field: offendingField }
    );
  }

  const parseResult = updateScheduleSchema.safeParse(body);
  if (!parseResult.success) {
    throw new ApiError(400, "Validation failed", "VALIDATION_ERROR", parseResult.error.flatten());
  }
  const changedBy = requireChangedBy(req);

  const updated = await updateSchedule(paramId(req, "id"), parseResult.data, changedBy);
  res.json(updated);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const deleted = await softDeleteSchedule(paramId(req, "id"), changedBy);
  res.json(deleted);
}

export async function restore(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);
  const restored = await restoreSchedule(paramId(req, "id"), changedBy);
  res.json(restored);
}
