import type { NextFunction, Request, Response } from "express";
import { z } from "zod";
import {
  assignSchemeSchema,
  citizenLocationSchema,
  partnerStatusReportSchema,
} from "./partner-locator.schema";
import {
  assignScheme,
  locatePartnersForScheme,
  reportPartnerStatus,
} from "./partner-locator.service";

export const getNearbyPartners = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const schemeReference = z.string().min(1).parse(req.params.schemeId);
    const { citizenLat, citizenLng, limit } = citizenLocationSchema.parse(
      req.body,
    );

    const result = await locatePartnersForScheme(
      schemeReference,
      citizenLat,
      citizenLng,
      limit,
    );
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const patchPartnerStatus = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const partnerId = z.string().uuid().parse(req.params.partnerId);
    const schemeId = z.string().uuid().parse(req.params.schemeId);
    const data = partnerStatusReportSchema.parse(req.body);

    const result = await reportPartnerStatus(partnerId, schemeId, data);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};

export const postAssignScheme = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const input = assignSchemeSchema.parse(req.body);
    const result = await assignScheme(input);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    next(error);
  }
};
