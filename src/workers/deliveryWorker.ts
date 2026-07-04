import { deliverWebhook } from "../services/deliveryService";
import { createAttempt } from "../models/attemptModel";
import {
  getPendingEvents,
  markDelivered,
  scheduleRetry,
  markFailed,
} from "../models/eventModel";
import { getNextAttemptTime } from "../services/retryService";

async function processPendingEvents() {
  const events = await getPendingEvents();

  for (const event of events) {
    const attemptNumber = event.attempts + 1;

    const delivery = await deliverWebhook(event.destination, event.payload);

    await createAttempt({
      eventId: event.id,
      attemptNumber,
      statusCode: delivery.statusCode,
      errorMessage: delivery.errorMessage,
      outcome: delivery.success ? "success" : "failure",
    });

    if (delivery.success) {
      await markDelivered(event.id, attemptNumber);
      continue;
    }

    const nextRetry = getNextAttemptTime(attemptNumber);

    if (!nextRetry) {
      await markFailed(event.id);
      continue;
    }

    await scheduleRetry(event.id, attemptNumber, nextRetry);
  }
}
processPendingEvents();
setInterval(processPendingEvents, 5000);

console.log("Delivery worker started.");
