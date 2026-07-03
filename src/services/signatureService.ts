
import crypto from "crypto";
import { env } from "../config/env";

export function generateSignature(payload: object): string{
    return crypto
    .createHmac("sha256", env.hmacSecret)
    .update(JSON.stringify(payload))
    .digest("hex");
}