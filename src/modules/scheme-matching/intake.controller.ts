import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import { handleCitizenMessage } from "./intake.service";
import { SUPPORTED_LANGUAGE_CODES } from "./languages";

const receiveMessageSchema = z.object({
  message: z.string().min(1).max(2000),
  // Phone number (WhatsApp) or web session token — the correlation key
  // that ties this message to the citizen's in-progress conversation.
  channelId: z.string().min(3).max(50),
  userId: z.string().uuid().optional(),
  // The portal language. Only a hint: replies follow the language the
  // citizen actually writes in, and this is used for messages that have
  // no language of their own. Channels without a UI (WhatsApp) omit it.
  preferredLanguage: z.enum(SUPPORTED_LANGUAGE_CODES).optional(),
});

export const receiveCitizenMessage = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { message, channelId, userId, preferredLanguage } =
      receiveMessageSchema.parse(req.body);
    const result = await handleCitizenMessage(
      message,
      channelId,
      userId,
      preferredLanguage,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
