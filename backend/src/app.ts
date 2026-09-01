import fs from "fs";
import path from "path";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import swaggerUi from "swagger-ui-express";
import { parse as parseYaml } from "yaml";

import { auth } from "./middleware/auth";
import { errorHandler } from "./middleware/errorHandler";

import authRoutes from "./routes/auth.routes";
import clientsRoutes from "./routes/clients.routes";
import projectsRoutes from "./routes/projects.routes";
import projectPeopleRoutes from "./routes/projectPeople.routes";
import environmentsRoutes from "./routes/environments.routes";
import serversRoutes from "./routes/servers.routes";
import credentialReferencesRoutes from "./routes/credentialReferences.routes";
import peopleRoutes from "./routes/people.routes";
import resourcesRoutes from "./routes/resources.routes";
import schedulesRoutes from "./routes/schedules.routes";
import activityLogsRoutes from "./routes/activityLogs.routes";
import searchRoutes from "./routes/search.routes";

dotenv.config();

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Swagger UI is dev-only: never mounted in production builds.
if (process.env.NODE_ENV !== "production") {
  const openapiPath = path.join(__dirname, "..", "openapi.yaml");
  if (fs.existsSync(openapiPath)) {
    const openapiDocument = parseYaml(fs.readFileSync(openapiPath, "utf-8"));
    app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openapiDocument));
  }
}

app.use("/api/auth", authRoutes);
app.use("/api/clients", auth, clientsRoutes);
app.use("/api/projects", auth, projectsRoutes);
app.use("/api/projects", auth, projectPeopleRoutes);
app.use("/api/environments", auth, environmentsRoutes);
app.use("/api/servers", auth, serversRoutes);
app.use("/api/credential-references", auth, credentialReferencesRoutes);
app.use("/api/people", auth, peopleRoutes);
app.use("/api/resources", auth, resourcesRoutes);
app.use("/api/schedules", auth, schedulesRoutes);
app.use("/api/activity-logs", auth, activityLogsRoutes);
app.use("/api/search", auth, searchRoutes);

app.use(errorHandler);
