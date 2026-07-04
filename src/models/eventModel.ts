import { pool } from "../config/db";

export interface CreateEvent {
  destination: string;
  payload: object;
}
export async function findOrCreateEndpoint(destination: string) {
  const existing = await pool.query(
    `
    SELECT *
    FROM endpoints
    WHERE destination = $1
    `,
    [destination],
  );

  if (existing.rows.length > 0) {
    return existing.rows[0];
  }

  const created = await pool.query(
    `
    INSERT INTO endpoints(destination)
    VALUES ($1)
    RETURNING *
    `,
    [destination],
  );

  return created.rows[0];
}

export async function createEvent(event: CreateEvent) {

  const endpoint = await findOrCreateEndpoint(event.destination);

  const query = `
    INSERT INTO events (
      destination,
      endpoint_id,
      payload
    )
    VALUES ($1, $2, $3)
    RETURNING *;
  `;

  const values = [event.destination, endpoint.id, event.payload];

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
  const result = await pool.query(
    `
    SELECT *
    FROM events
    WHERE id=$1
`,
    [id],
  );

  return result.rows[0];
}
export async function getPendingEvents() {
  const result = await pool.query(`
    SELECT e.*
    FROM events e
    JOIN endpoints ep
      ON e.endpoint_id = ep.id
    WHERE
      ep.paused = FALSE
      AND e.status IN ('pending','failed')
      AND e.next_attempt_at <= NOW()
    ORDER BY e.next_attempt_at;
  `);

  return result.rows;
}
export async function resetEvent(id: string) {
  await pool.query(
    `
      UPDATE events
      SET
          status='pending',
          attempts=0,
          next_attempt_at=NOW(),
          updated_at=NOW()
      WHERE id=$1
  `,
    [id],
  );
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

export async function moveToDeadLetter(id: string, attempts: number) {
  await pool.query(
    `
    UPDATE events
    SET
     status='dead_letter',
     attempts=$2,
     updated_at=NOW()
    WHERE id=$1
    `,
    [id, attempts],
  );
}

export async function getDeadLetters() {
  const result = await pool.query(`
    SELECT
        id,
        destination,
        attempts,
        payload,
        updated_at
     FROM events
     WHERE status='dead_letter'
     ORDER BY updated_at DESC
     `);
  return result.rows;
}

export async function updateEndpointHealth(
  endpointId: string,
  success: boolean,
) {
  const result = await pool.query(
    `
    SELECT health_score
    FROM endpoints
    WHERE id=$1
    `,
    [endpointId],
  );

  const score = result.rows[0].health_score;

  const newScore = success
    ? Math.min(100, score + 10)
    : Math.max(0, score - 20);

  await pool.query(
    `
    UPDATE endpoints
    SET
      health_score=$2,
      paused=$3
    WHERE id=$1
    `,
    [endpointId, newScore, newScore < 20],
  );
}

export async function getEndpointHealth() {
  const result = await pool.query(`
    SELECT
      id,
      destination,
      health_score,
      paused
    FROM endpoints
    ORDER BY destination;
  `);

  return result.rows;
}


