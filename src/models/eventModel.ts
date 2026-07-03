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

export async function  updateEventStatus(
    id: string,
    status: string,
    attempts: number
){
  console.log("Updating event:",{
    id, status, attempts
  })
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
    "SELECT * FROM events WHERE id = $1",
    [id]
  );
  return result.rows[0];
}