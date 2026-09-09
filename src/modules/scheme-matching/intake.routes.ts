import { Router } from "express";
import { receiveCitizenMessage } from "./intake.controller";

export const intakeRouter = Router();

intakeRouter.post("/messages", receiveCitizenMessage);
