import crypto from "node:crypto";
import type { Response } from "express";
import type { Campaign } from "@shared/schema";

type StreamClient = {
  id: string;
  tenantId: number;
  res: Response;
  keepAlive: NodeJS.Timeout;
};

const campaignStreams = new Map<string, StreamClient>();

function createKeepAlive(res: Response) {
  return setInterval(() => {
    if (!res.writableEnded) {
      res.write(":keep-alive\n\n");
    }
  }, 25000);
}

export function registerCampaignStream(tenantId: number, res: Response) {
  const id = crypto.randomUUID();

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();
  res.write(`event: connected\ndata: ${JSON.stringify({ id })}\n\n`);

  const keepAlive = createKeepAlive(res);
  campaignStreams.set(id, { id, tenantId, res, keepAlive });

  const dispose = () => {
    const stream = campaignStreams.get(id);
    if (!stream) return;
    clearInterval(stream.keepAlive);
    campaignStreams.delete(id);
  };

  return { id, dispose };
}

export function broadcastCampaignUpdate(tenantId: number, campaign: Campaign) {
  if (campaignStreams.size === 0) return;

  const payload = JSON.stringify(campaign);
  for (const stream of campaignStreams.values()) {
    if (stream.tenantId === tenantId && !stream.res.writableEnded) {
      stream.res.write(`event: campaign:update\ndata: ${payload}\n\n`);
    }
  }
}

