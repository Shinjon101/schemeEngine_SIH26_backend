import { Router } from "express";
import {
  getNearbyPartners,
  patchPartnerStatus,
  postAssignScheme,
} from "./partner-locator.controller";

export const partnerLocatorRouter = Router();

partnerLocatorRouter.post("/schemes/:schemeId/nearby", getNearbyPartners);
partnerLocatorRouter.patch(
  "/partners/:partnerId/schemes/:schemeId/status",
  patchPartnerStatus,
);
partnerLocatorRouter.post("/assignments", postAssignScheme);
