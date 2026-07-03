import { Request, Response } from "express";
import { createWebhookEvent } from "../services/eventService";


export async function createEvent(req: Request, res: Response){
    try{
        const {destination, payload} = req.body;
        const event = await createWebhookEvent(destination, payload);

        res.status(201).json(event);
    }catch(error){
        console.error(error)
        res.status(500).json({
            message: "Failed to create event"
        })
    }
}