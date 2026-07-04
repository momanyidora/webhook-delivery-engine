import { createEvent, getDeadLetters } from "../models/eventModel";
import { getEventById, resetEvent, getEndpointHealth } from "../models/eventModel";

export async function createWebhookEvent(destination: string, payload: object) {
  const event = await createEvent({
    destination,
    payload,
  });
  return event;
}
export async function replayEvent(id: string) {
  const event = await getEventById(id);

  if (!event) {
    return null;
  }

  await resetEvent(id);

  return await getEventById(id);
}
export async function listDeadLetters() {
  return getDeadLetters();
}

export async function endpointHealth() {
  return getEndpointHealth();
}