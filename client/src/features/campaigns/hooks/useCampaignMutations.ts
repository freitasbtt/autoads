import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { campaignQueryKeys } from "./useCampaignListData";

type ToggleStatusPayload = {
  id: number;
  status: string;
};

export function useCampaignMutations() {
  const { toast } = useToast();

  const invalidateCampaigns = () =>
    queryClient.invalidateQueries({ queryKey: campaignQueryKeys.campaigns });

  const toggleStatusMutation = useMutation({
    mutationFn: ({ id, status }: ToggleStatusPayload) =>
      apiRequest("PATCH", `/api/campaigns/${id}`, { status }),
    onSuccess: () => {
      invalidateCampaigns();
      toast({
        title: "Status atualizado",
        description: "O status da campanha foi alterado com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao atualizar status",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/campaigns/${id}`),
    onSuccess: () => {
      invalidateCampaigns();
      toast({
        title: "Campanha excluída",
        description: "A campanha foi removida com sucesso",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Erro ao excluir campanha",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return {
    toggleStatus: (payload: ToggleStatusPayload) => toggleStatusMutation.mutate(payload),
    deleteCampaign: (id: number) => deleteMutation.mutate(id),
    toggleStatusMutation,
    deleteMutation,
  };
}
