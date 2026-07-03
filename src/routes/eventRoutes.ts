import { Router } from "express";
import { createEvent } from "../controllers/eventController";


const router = Router();
router.post("/", createEvent);

export default router;