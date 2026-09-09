import { Router } from "express";
import { recommendSchemes } from "./scheme-matching.controller";

export const schemeMatchingRouter = Router();

schemeMatchingRouter.post("/recommendations", recommendSchemes);
