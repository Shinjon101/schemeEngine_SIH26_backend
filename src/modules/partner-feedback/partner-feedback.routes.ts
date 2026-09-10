import { Router } from "express";
import { reportOutcome } from "./partner-feedback.controller";

export const partnerFeedbackRouter = Router();

partnerFeedbackRouter.post("/", reportOutcome);
