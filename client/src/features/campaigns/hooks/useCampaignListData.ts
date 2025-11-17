import { useQuery } from "@tanstack/react-query";
import type { Audience, Campaign, Resource } from "@shared/schema";

export const campaignQueryKeys = {
  campaigns: ["/api/campaigns"] as const,
  resources: ["/api/resources"] as const,
  audiences: ["/api/audiences"] as const,
};

export function useCampaignListData() {
  const campaignsQuery = useQuery<Campaign[]>({
    queryKey: campaignQueryKeys.campaigns,
  });

  const resourcesQuery = useQuery<Resource[]>({
    queryKey: campaignQueryKeys.resources,
  });

  const audiencesQuery = useQuery<Audience[]>({
    queryKey: campaignQueryKeys.audiences,
  });

  return {
    campaigns: campaignsQuery.data ?? [],
    resources: resourcesQuery.data ?? [],
    audiences: audiencesQuery.data ?? [],
    isLoading: campaignsQuery.isLoading,
  };
}
