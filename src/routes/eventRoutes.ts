import { Router } from "express";
import { createEvent, getDeadLetters, replay } from "../controllers/eventController";


const router = Router();
router.post("/", createEvent);
router.get("/dead-letters", getDeadLetters);
router.post("/:id/replay", replay);

export default router;