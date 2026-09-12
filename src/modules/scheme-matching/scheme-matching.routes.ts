import { Router } from "express";
import {
  recommendSchemes,
  summariseSchemes,
} from "./scheme-matching.controller";

export const schemeMatchingRouter = Router();

schemeMatchingRouter.post("/recommendations", recommendSchemes);
schemeMatchingRouter.post("/summary", summariseSchemes);
