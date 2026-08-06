import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  createScheduleSchema,
  updateScheduleSchema,
} from "../validators/schedules.validator";
import {
  createSchedule,
  getScheduleById,
  listSchedules,
  softDeleteSchedule,
  updateSchedule,
} from "../services/schedules.service";

export async function list(req: Request, res: Response) {
  const projectId = typeof req.query.project_id === "string" ? req.query.project_id : undefined;
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;

  const schedules = await listSchedules({ projectId, status, from, to });
  res.json(schedules);
}

export async function getOne(req: Request, res: Response) {
  const schedule = await getScheduleById(paramId(req, "id"));
  if (!schedule) throw new ApiError(404, "Schedule not found");
  res.json(schedule);
}

export async function create(req: Request, res: Response) {
  const input = createScheduleSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createSchedule(input, tx);
    await logActivity("schedule", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updateScheduleSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getScheduleById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Schedule not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updateSchedule(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Schedule not found");
    await logActivity("schedule", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getScheduleById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Schedule not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeleteSchedule(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Schedule not found");
    await logActivity("schedule", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}
