import { deliverWebhook } from "../services/deliveryService";
import { createAttempt } from "../models/attemptModel";
import {
  getPendingEvents,
  markDelivered,
  scheduleRetry,
  moveToDeadLetter,
} from "../models/eventModel";
import { getNextAttemptTime } from "../services/retryService";

async function processPendingEvents() {
  const events = await getPendingEvents();

  for (const event of events) {
    const attemptNumber = event.attempts + 1;

    const delivery = await deliverWebhook(event.destination, event.payload, event.id);

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
      await moveToDeadLetter(event.id, attemptNumber)
      continue;
    }

    await scheduleRetry(event.id, attemptNumber, nextRetry);
  }
}
processPendingEvents();
setInterval(processPendingEvents, 5000);

console.log("Delivery worker started.");
