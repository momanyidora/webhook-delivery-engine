import { Request, Response } from "express";
import { createWebhookEvent, listDeadLetters, replayEvent } from "../services/eventService";

export async function createEvent(req: Request, res: Response) {
  try {
    const { destination, payload } = req.body;
    const event = await createWebhookEvent(destination, payload);

    res.status(201).json(event);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to create event",
    });
  }
}
export async function getDeadLetters(req: Request, res: Response) {
  try {
    const events = await listDeadLetters();

    res.json(events);
  } catch {
    res.status(500).json({
      message: "Failed to fetch dead letters",
    });
  }
}

export async function replay(
  req: Request<{ id: string }>,
  res: Response
) {
  const event = await replayEvent(req.params.id);

  if (!event) {
    return res.status(404).json({
      message: "Event not found",
    });
  }

  return res.json({
    message: "Replay scheduled",
    event,
  });
}

