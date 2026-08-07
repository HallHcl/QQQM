import fs from "fs";
import path from "path";
import { OpenApiGeneratorV3 } from "@asteasolutions/zod-to-openapi";
import { stringify } from "yaml";
import { registry } from "./registry";

const generator = new OpenApiGeneratorV3(registry.definitions);

const document = generator.generateDocument({
  openapi: "3.0.0",
  info: {
    title: "QQM API",
    version: "1.0.0",
    description:
      "Client / project / infrastructure management API. Generated from the actual implemented routes, controllers, and zod validators (backend/src/openapi) — not from any prior design document.",
    license: { name: "ISC", url: "https://opensource.org/licenses/ISC" },
  },
  // Every registered path already includes the literal /api prefix as
  // implemented, so the server URL points at the app root (not /api) to
  // avoid a doubled prefix when "Try it out" builds request URLs.
  servers: [{ url: "/", description: "Same-origin backend" }],
});

const outDir = path.join(__dirname, "..", "..");
const yamlPath = path.join(outDir, "openapi.yaml");
fs.writeFileSync(yamlPath, stringify(document, { aliasDuplicateObjects: false }));

console.log(`OpenAPI spec written to ${yamlPath}`);
