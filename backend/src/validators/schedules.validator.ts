import { z } from "zod";

const scheduleTypeEnum = z.enum(["PM", "MA", "other"]);
const scheduleStatusEnum = z.enum([
  "pending",
  "in_progress",
  "done",
  "cancelled",
]);

export const createScheduleSchema = z.object({
  project_id: z.string().uuid().optional(),
  server_id: z.string().uuid().optional(),
  title: z.string().min(1),
  type: scheduleTypeEnum,
  scheduled_date: z.string().min(1),
  assigned_to: z.string().uuid(),
  status: scheduleStatusEnum.optional(),
  notes: z.string().optional(),
});

export const updateScheduleSchema = z.object({
  project_id: z.string().uuid().optional(),
  server_id: z.string().uuid().optional(),
  title: z.string().min(1).optional(),
  type: scheduleTypeEnum.optional(),
  scheduled_date: z.string().min(1).optional(),
  started_at: z.string().optional(),
  completed_at: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  status: scheduleStatusEnum.optional(),
  notes: z.string().optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
