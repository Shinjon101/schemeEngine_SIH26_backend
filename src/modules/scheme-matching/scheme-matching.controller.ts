import type { NextFunction, Request, Response } from "express";
import { matchSchemesForCitizen } from "./scheme-matching.service";
import { summariseRecommendations } from "./scheme-summary.service";
import { schemeSummaryRequestSchema } from "./scheme-summary.schema";

export const recommendSchemes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const matches = await matchSchemesForCitizen(req.body, req.body.userId);
    res.status(200).json({ success: true, data: { matches } });
  } catch (error) {
    next(error);
  }
};

export const summariseSchemes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const request = schemeSummaryRequestSchema.parse(req.body);
    const summary = await summariseRecommendations(request);
    res.status(200).json({ success: true, data: summary });
  } catch (error) {
    next(error);
  }
};
