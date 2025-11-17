import { Router } from "express";
import type { User } from "@shared/schema";
import { registerCampaignStream } from "./sse";
import { isAuthenticated } from "../../middlewares/auth";

export const realtimeRouter = Router();

realtimeRouter.get("/campaigns", isAuthenticated, (req, res) => {
  const user = req.user as User;
  const { dispose } = registerCampaignStream(user.tenantId, res);

  req.on("close", dispose);
  req.on("error", dispose);
});

