import type { NextFunction, Request, Response } from "express";
import { handleCitizenMessage } from "./intake.service";

export const receiveCitizenMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { message, userId } = req.body;
    const result = await handleCitizenMessage(message, userId);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
