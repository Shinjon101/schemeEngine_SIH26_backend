import type { NextFunction, Request, Response } from "express";
import { matchSchemesForCitizen } from "./scheme-matching.service";

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
