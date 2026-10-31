import type { Request, Response } from "express";
import {
  createIncident,
  listIncidents,
  getIncidentById,
  updateIncident,
  changeIncidentStatus,
  assignIncident,
  getActiveResponders,
  IncidentNotFoundError,
  ForbiddenOperationError,
  InvalidTransitionError,
  BadRequestError,
} from "./incident.service.js";
import type {
  CreateIncidentInput,
  UpdateIncidentInput,
  ChangeStatusInput,
  AssignIncidentInput,
  QueryIncidentsInput,
} from "./incident.schemas.js";

function handleError(error: unknown, res: Response): void {
  if (error instanceof IncidentNotFoundError) {
    res.status(404).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof ForbiddenOperationError) {
    res.status(403).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof InvalidTransitionError) {
    res.status(400).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  if (error instanceof BadRequestError) {
    res.status(400).json({
      success: false,
      code: error.code,
      message: error.message,
    });
    return;
  }

  console.error("[IncidentController] Unhandled error:", error);
  res.status(500).json({
    success: false,
    code: "INTERNAL_SERVER_ERROR",
    message: "An internal server error occurred while processing the incident request",
  });
}

export async function createIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;
    const input: CreateIncidentInput = req.body;
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
    };

    const incident = await createIncident(user, input, meta);

    res.status(201).json({
      success: true,
      message: "Incident reported successfully",
      data: incident,
    });
  } catch (error) {
    handleError(error, res);
  }
}

export async function listIncidentsHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;
    const query = ((req as any).validatedQuery || req.query) as QueryIncidentsInput;

    const result = await listIncidents(user, query);

    res.status(200).json({
      success: true,
      data: result.incidents,
      pagination: result.pagination,
    });
  } catch (error) {
    handleError(error, res);
  }
}

export async function getIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;
    const id = String(req.params.id);

    const incident = await getIncidentById(user, id);

    res.status(200).json({
      success: true,
      data: incident,
    });
  } catch (error) {
    handleError(error, res);
  }
}

export async function updateIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const input: UpdateIncidentInput = req.body;
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
    };

    const updated = await updateIncident(user, id, input, meta);

    res.status(200).json({
      success: true,
      message: "Incident updated successfully",
      data: updated,
    });
  } catch (error) {
    handleError(error, res);
  }
}

export async function changeStatusHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const input: ChangeStatusInput = req.body;
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
    };

    const updated = await changeIncidentStatus(user, id, input, meta);

    res.status(200).json({
      success: true,
      message: "Incident status updated successfully",
      data: updated,
    });
  } catch (error) {
    handleError(error, res);
  }
}

export async function assignIncidentHandler(req: Request, res: Response): Promise<void> {
  try {
    const user = req.user!;
    const id = String(req.params.id);
    const input: AssignIncidentInput = req.body;
    const meta = {
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"] as string,
    };

    const updated = await assignIncident(user, id, input, meta);

    res.status(200).json({
      success: true,
      message: "Incident assigned successfully",
      data: updated,
    });
  } catch (error) {
    handleError(error, res);
  }
}


export async function getRespondersHandler(_req: Request, res: Response): Promise<void> {
  try {
    const responders = await getActiveResponders();

    res.status(200).json({
      success: true,
      data: responders,
    });
  } catch (error) {
    handleError(error, res);
  }
}
