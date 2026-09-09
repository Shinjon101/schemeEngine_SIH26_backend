import type { NextFunction, Request, Response } from "express";
import { matchSchemesForCitizen } from "./scheme-matching.service";

export const recommendSchemes = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const results = await matchSchemesForCitizen(req.body, req.body.userId);
    res.status(200).json({ success: true, data: results });
  } catch (error) {
    next(error);
  }
};
