import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { ApiError } from "../middleware/errorHandler";
import { loginSchema } from "../validators/auth.validator";
import { findRoleNamesForUser, findUserById, findUserByUsername } from "../services/auth.service";

export async function login(req: Request, res: Response) {
  const input = loginSchema.parse(req.body);

  const user = await findUserByUsername(input.username);
  if (!user) {
    throw new ApiError(401, "Invalid username or password");
  }

  const passwordMatches = await bcrypt.compare(input.password, user.password_hash);
  if (!passwordMatches) {
    throw new ApiError(401, "Invalid username or password");
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
    throw new ApiError(401, "Not authenticated");
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
