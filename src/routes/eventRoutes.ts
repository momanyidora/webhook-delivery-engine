import { Router } from "express";
import { createEvent, getDeadLetters, health, replay } from "../controllers/eventController";


const router = Router();
router.post("/", createEvent);
router.get("/dead-letters", getDeadLetters);
router.post("/:id/replay", replay);
router.get("/health", health)
export default router;