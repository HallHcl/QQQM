import { z } from "zod";

const SCHEDULE_TYPES = ["PM", "MA", "other"] as const;
const SCHEDULE_STATUSES = ["pending", "in_progress", "done", "cancelled"] as const;

export const createScheduleSchema = z
  .object({
    project_id: z.string().uuid().optional(),
    server_id: z.string().uuid().optional(),
    title: z.string().min(1),
    type: z.enum(SCHEDULE_TYPES),
    scheduled_date: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "scheduled_date must be a valid date",
    }),
    assigned_to: z.string().uuid(),
    notes: z.string().optional(),
  })
  // The DB CHECK constraint (chk_schedules_has_parent, migration 006) is the
  // source of truth for this rule; this refine exists purely so the error
  // surfaces as a clean 400 VALIDATION_ERROR instead of a raw DB error.
  .refine((data) => Boolean(data.project_id) || Boolean(data.server_id), {
    message: "At least one of project_id or server_id is required",
    path: ["project_id"],
  });

// scheduled_date/project_id/server_id/assigned_to/type are NOT editable via
// this endpoint in this pass (scope decision — see report). started_at/
// completed_at are never accepted from the client; the controller rejects
// their presence explicitly before this schema even runs.
export const updateScheduleSchema = z.object({
  status: z.enum(SCHEDULE_STATUSES).optional(),
  notes: z.string().optional(),
  updated_at: z.string().min(1),
});

export const listSchedulesQuerySchema = z.object({
  page: z.number().int().min(1),
  per_page: z.number().int().min(1).max(100),
  sort: z.enum(["scheduled_date", "created_at", "updated_at"]),
  order: z.enum(["asc", "desc"]),
  project_id: z.string().uuid().optional(),
  status: z.enum(SCHEDULE_STATUSES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  deleted: z.enum(["false", "true", "all"]),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type ListSchedulesQuery = z.infer<typeof listSchedulesQuerySchema>;
