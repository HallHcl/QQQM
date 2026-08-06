import { Request, Response } from "express";
import { withTransaction } from "../db/withTransaction";
import { ApiError } from "../middleware/errorHandler";
import { logActivity } from "../middleware/activityLogger";
import { paramId, requireChangedBy } from "../utils/requestContext";
import {
  addPeopleClientSchema,
  createPersonSchema,
  updatePersonSchema,
} from "../validators/people.validator";
import {
  createPerson,
  getPersonById,
  listPeople,
  softDeletePerson,
  updatePerson,
} from "../services/people.service";
import {
  addClientToPerson,
  listClientsForPerson,
  removeClientFromPerson,
} from "../services/peopleClients.service";

export async function list(req: Request, res: Response) {
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const clientId = typeof req.query.client_id === "string" ? req.query.client_id : undefined;
  const search = typeof req.query.search === "string" ? req.query.search : undefined;

  const people = await listPeople({ type, clientId, search });
  res.json(people);
}

export async function getOne(req: Request, res: Response) {
  const person = await getPersonById(paramId(req, "id"));
  if (!person) throw new ApiError(404, "Person not found");
  res.json(person);
}

export async function create(req: Request, res: Response) {
  const input = createPersonSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const result = await withTransaction(async (tx) => {
    const created = await createPerson(input, tx);
    await logActivity("people", created.id, "create", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function update(req: Request, res: Response) {
  const input = updatePersonSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const existing = await getPersonById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Person not found");

  const result = await withTransaction(async (tx) => {
    const updated = await updatePerson(paramId(req, "id"), input, tx);
    if (!updated) throw new ApiError(404, "Person not found");
    await logActivity("people", updated.id, "update", changedBy, existing, updated, tx);
    return updated;
  });

  res.json(result);
}

export async function remove(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const existing = await getPersonById(paramId(req, "id"));
  if (!existing) throw new ApiError(404, "Person not found");

  const result = await withTransaction(async (tx) => {
    const deleted = await softDeletePerson(paramId(req, "id"), tx);
    if (!deleted) throw new ApiError(404, "Person not found");
    await logActivity("people", deleted.id, "delete", changedBy, existing, deleted, tx);
    return deleted;
  });

  res.json(result);
}

export async function listClients(req: Request, res: Response) {
  const clients = await listClientsForPerson(paramId(req, "id"));
  res.json(clients);
}

export async function addClient(req: Request, res: Response) {
  const input = addPeopleClientSchema.parse(req.body);
  const changedBy = requireChangedBy(req);

  const person = await getPersonById(paramId(req, "id"));
  if (!person) throw new ApiError(404, "Person not found");

  const result = await withTransaction(async (tx) => {
    const created = await addClientToPerson(
      paramId(req, "id"),
      input.client_id,
      input.relationship_type,
      tx
    );
    await logActivity("people", paramId(req, "id"), "update", changedBy, null, created, tx);
    return created;
  });

  res.status(201).json(result);
}

export async function removeClient(req: Request, res: Response) {
  const changedBy = requireChangedBy(req);

  const person = await getPersonById(paramId(req, "id"));
  if (!person) throw new ApiError(404, "Person not found");

  const result = await withTransaction(async (tx) => {
    const removed = await removeClientFromPerson(paramId(req, "id"), paramId(req, "clientId"), tx);
    if (!removed) throw new ApiError(404, "Client relationship not found");
    await logActivity("people", paramId(req, "id"), "update", changedBy, removed, null, tx);
    return removed;
  });

  res.json(result);
}
