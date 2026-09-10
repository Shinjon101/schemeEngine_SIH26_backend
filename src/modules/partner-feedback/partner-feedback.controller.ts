import type { NextFunction, Request, Response } from "express";
import { reportOutcomeSchema } from "./partner-feedback.schema";
import { submitOutcomeReport } from "./partner-feedback.service";

export const reportOutcome = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const input = reportOutcomeSchema.parse(req.body);
    const result = await submitOutcomeReport(input);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
