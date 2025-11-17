import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Campaign } from "@shared/schema";
import { campaignQueryKeys } from "./useCampaignListData";

function updateCampaignList(prev: Campaign[] | undefined, incoming: Campaign): Campaign[] {
  if (!prev || prev.length === 0) {
    return [incoming];
  }

  const index = prev.findIndex((campaign) => campaign.id === incoming.id);
  if (index === -1) {
    return [...prev, incoming];
  }

  const next = [...prev];
  next[index] = incoming;
  return next;
}

export function useCampaignRealtime() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const eventSource = new EventSource("/api/events/campaigns", { withCredentials: true });

    const handleUpdate = (event: MessageEvent<string>) => {
      try {
        const campaign = JSON.parse(event.data) as Campaign;
        queryClient.setQueryData<Campaign[] | undefined>(
          campaignQueryKeys.campaigns,
          (current) => updateCampaignList(current, campaign),
        );
      } catch (err) {
        console.error("Failed to process campaign update event", err);
      }
    };

    eventSource.addEventListener("campaign:update", handleUpdate as EventListener);

    return () => {
      eventSource.removeEventListener("campaign:update", handleUpdate as EventListener);
      eventSource.close();
    };
  }, [queryClient]);
}

