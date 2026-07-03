import { createEvent, updateEventStatus, getEventById } from "../models/eventModel";
import { createAttempt } from "../models/attemptModel";
import { deliverWebhook } from "./deliveryService";

export async function createWebhookEvent(destination: string, payload: object) {
  const event = await createEvent({
    destination,
    payload,
  });

  const delivery = await deliverWebhook(destination, payload);

  await createAttempt({
    eventId: event.id,
    attemptNumber: 1,
    statusCode: delivery.statusCode,
    errorMessage: delivery.errorMessage,
    outcome: delivery.success ? "success" : "failure",
  });
console.log("Delivery result:", delivery);
  await updateEventStatus(
    event.id,
    delivery.success ? "delivered" : "failed",
    1,
  );
  return await getEventById(event.id)

  // console.log("Event updated")


  
}
                         