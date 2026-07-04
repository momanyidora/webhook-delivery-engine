import { createEvent } from "../models/eventModel";

export async function createWebhookEvent(destination: string, payload: object) {
  const event = await createEvent({
    destination,
    payload,
  });
return event

  
}
                         