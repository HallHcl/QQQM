import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ApiError } from "../middleware/errorHandler";
import { changePasswordSchema, loginSchema } from "../validators/auth.validator";
import {
  findRoleNamesForUser,
  findUserById,
  findUserByUsername,
  updateUserPassword,
} from "../services/auth.service";
import { logActivity } from "../middleware/activityLogger";
import { requireChangedBy } from "../utils/requestContext";

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);

  const user = await findUserByUsername(input.username);
  if (!user) {
    throw new ApiError(401, "Invalid username or password", "UNAUTHORIZED");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid username or password", "UNAUTHORIZED");
  }

  const roles = await findRoleNamesForUser(user.id);

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new ApiError(500, "JWT secret is not configured");
  }

  const token = jwt.sign(
    { id: user.id, peopleId: user.people_id, roles },
    secret,
    { expiresIn: "8h" }
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      peopleId: user.people_id,
      roles,
    },
  });
}

export async function me(req: Request, res: Response) {
  if (!req.user) {
    throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
  }

  const user = await findUserById(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    peopleId: user.people_id,
    roles: req.user.roles,
  });
}

export async function logout(_req: Request, res: Response) {
  res.json({ message: "Logged out" });
}

export async function changePassword(req: Request, res: Response) {
  if (!req.user) {
    throw new ApiError(401, "Not authenticated", "UNAUTHORIZED");
  }

  const parseResult = changePasswordSchema.safeParse(req.body);
  if (!parseResult.success) {
    throw new ApiError(
      400,
      "Validation failed",
      "VALIDATION_ERROR",
      parseResult.error.flatten()
    );
  }
  const input = parseResult.data;

  const user = await findUserById(req.user.id);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  const passwordMatches = await bcrypt.compare(
    input.current_password,
    user.password_hash
  );
  if (!passwordMatches) {
    throw new ApiError(401, "Current password is incorrect", "UNAUTHORIZED");
  }

  const newHash = await bcrypt.hash(input.new_password, 10);
  await updateUserPassword(user.id, newHash);

  await logActivity(
    "user",
    user.id,
    "update",
    requireChangedBy(req),
    undefined,
    { action: "password_changed" }
  );

  res.json({ message: "Password updated" });
}
