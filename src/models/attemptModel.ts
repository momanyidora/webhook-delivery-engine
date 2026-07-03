
import {pool} from "../config/db"

export interface Attempt{
    eventId: string;
    attemptNumber: number;
    statusCode?: number;
    errorMessage?: string;
    outcome: "success" | "failure";
}

export async function createAttempt(attempt: Attempt){
    const query = `
    INSERT INTO delivery_attempts(
        event_id,
        attempt_number,
        status_code,
        error_message,
        outcome
            )
     VALUES ($1, $2, $3, $4, $5); 
     `;

     const values = [
        attempt.eventId,
        attempt.attemptNumber,
        attempt.statusCode ?? null,
        attempt.errorMessage ?? null,
        attempt.outcome,
     ];
     await pool.query(query, values)
}