import { pool } from "../config/db";

export interface CreateEvent {
  destination: string;
  payload: object;
}

export async function createEvent(event: CreateEvent) {
  const query = `
      INSERT INTO events (destination, payload)
      VALUES ($1, $2)
      RETURNING *;
    `;

  const values = [event.destination, event.payload];
  const result = await pool.query(query, values);

  return result.rows[0];
}

export async function updateEventStatus(
  id: string,
  status: string,
  attempts: number,
) {
  console.log("Updating event:", {
    id,
    status,
    attempts,
  });
  const query = `UPDATE events
     SET status = $2,
     attempts =$3,
     updated_at = NOW() 
     WHERE id = $1;
     `;

  const result = await pool.query(query, [id, status, attempts]);

  console.log("Rows updated:", result.rowCount);
}

export async function getEventById(id: string) {
  const result = await pool.query("SELECT * FROM events WHERE id = $1", [id]);
  return result.rows[0];
}
export async function getPendingEvents() {
  const result = await pool.query(`
        SELECT *
        FROM events
        WHERE
            status IN ('pending','failed')
        AND next_attempt_at <= NOW()
        ORDER BY next_attempt_at ASC
    `);

  return result.rows;
}

// helper that schedule the next retry

export async function scheduleRetry(
  id: string,
  attempts: number,
  nextAttempt: Date,
) {
  await pool.query(
    `
    UPDATE events
    SET 
    status = 'failed',
    attempts =$2,
    next_attempt_at = $3,
    updated_at = NOW()
    WHERE id = $1
    `,
    [id, attempts, nextAttempt],
  );
}

export async function markDelivered(id: string, attempts: number) {
  await pool.query(
    `
    UPDATE events
    SET
      status='delivered',
      attempts=$2,
      updated_at=NOW()
    WHERE id=$1
`,
    [id, attempts],
  );
}
export async function markFailed(id: string) {
  await pool.query(
    `
    UPDATE events
    SET status='failed',
        updated_at=NOW()
    WHERE id=$1
`,
    [id],
  );
}