import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type UIEvent } from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Circle, Plus } from "lucide-react";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Modifier } from "@dnd-kit/core";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TaskDistributionProps = {
  taskId: string;
};

type PairView = {
  pairId: string;
  position: number;
  title: string | null;
  text: string | null;
  feedUploadId: number;
  storiesUploadId: number;
  feedAssetId: string;
  storyAssetId: string;
  feedObjectPath: string;
  storyObjectPath: string;
  feedThumbnailUrl: string | null;
  storyThumbnailUrl: string | null;
};

type CampaignRecord = {
  id: string;
  name: string | null;
  objective: string | null;
  status: string | null;
  buyingType: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  budget: string | null;
  updatedTime: string | null;
  specialAdCategories: string[];
};

type AdsetRecord = {
  id: string;
  name: string | null;
  status: string | null;
  configuredStatus: string | null;
  effectiveStatus: string | null;
  optimizationGoal: string | null;
  billingEvent: string | null;
  bidStrategy: string | null;
  destination: {
    type: string;
    pageId: string | null;
    instagramUserId: string | null;
    leadgenFormId: string | null;
    whatsappNumber: string | null;
  };
};

type PairAssignmentRecord = {
  pairId: string;
  useCampaignDefault: boolean;
  leadgenFormId: string | null;
  leadgenFormName: string | null;
};

type DestinationRecord = {
  resourceId: number;
  adAccountId: string;
  adAccountName: string;
  connectionStatus: string;
  campaign: CampaignRecord;
  adsets: AdsetRecord[];
  applyToAllAdsets: boolean;
  selectedAdsetIds: string[];
  pairIds: string[];
  campaignLeadgenFormId: string | null;
  campaignLeadgenFormName: string | null;
  pairAssignments: PairAssignmentRecord[];
  createAdsStatus: "PAUSED" | "ACTIVE";
};

type DistributionState = {
  destinations: DestinationRecord[];
};

type DistributionDetail = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  pairs: PairView[];
  distribution: DistributionState;
};

type AccountSearchItem = {
  resourceId: number;
  name: string;
  adAccountId: string;
  connectionStatus: string;
};

type CampaignOption = CampaignRecord & {
  adsetCount: number;
  lastUpdated: string | null;
  adsets: AdsetRecord[];
};

type AccountBlock = {
  resourceId: number;
  name: string;
  adAccountId: string;
  connectionStatus: string;
  campaignCount: number;
  campaigns: CampaignOption[];
  isLoading: boolean;
  error: string | null;
};

type AccountCampaignResponse = {
  account: {
    resourceId: number;
    name: string;
    adAccountId: string;
    connectionStatus: string;
    campaignCount: number;
  };
  campaigns: CampaignOption[];
};

type CampaignContextResponse = {
  campaign: CampaignOption;
};

type LoadedCampaignRef = {
  account: AccountSearchItem;
  campaign: CampaignOption;
};

type ViewMode = "visual" | "matrix";

type LeadformOption = {
  resourceId: number;
  metaFormId: string;
  name: string;
  status: string | null;
  createdTime: string | null;
};

type LeadformPickerTarget =
  | {
      mode: "campaign";
      account: AccountSearchItem;
      campaign: CampaignOption;
      options: LeadformOption[];
    }
  | {
      mode: "pair";
      account: AccountSearchItem;
      campaign: CampaignOption;
      pairId: string;
      options: LeadformOption[];
    };

function makeCampaignKey(resourceId: number, campaignId: string) {
  return `${resourceId}:${campaignId}`;
}

function makePairAssignmentKey(campaignKey: string, pairId: string) {
  return `${campaignKey}:${pairId}`;
}

function buildDestination(account: AccountSearchItem, campaign: CampaignOption, pairIds: string[] = []): DestinationRecord {
  return {
    resourceId: account.resourceId,
    adAccountId: account.adAccountId,
    adAccountName: account.name,
    connectionStatus: account.connectionStatus,
    campaign: {
      id: campaign.id,
      name: campaign.name,
      objective: campaign.objective,
      status: campaign.status,
      buyingType: campaign.buyingType,
      configuredStatus: campaign.configuredStatus,
      effectiveStatus: campaign.effectiveStatus,
      budget: campaign.budget,
      updatedTime: campaign.updatedTime,
      specialAdCategories: campaign.specialAdCategories,
    },
    adsets: campaign.adsets,
    applyToAllAdsets: true,
    selectedAdsetIds: campaign.adsets.map((adset) => adset.id),
    pairIds,
    campaignLeadgenFormId: null,
    campaignLeadgenFormName: null,
    pairAssignments: syncPairAssignments(pairIds, []),
    createAdsStatus: "PAUSED",
  };
}

function syncPairAssignments(pairIds: string[], pairAssignments: PairAssignmentRecord[]) {
  const uniquePairIds = Array.from(new Set(pairIds));
  const assignmentByPairId = new Map(pairAssignments.map((assignment) => [assignment.pairId, assignment]));

  return uniquePairIds.map((pairId) => {
    return (
      assignmentByPairId.get(pairId) ?? {
        pairId,
        useCampaignDefault: true,
        leadgenFormId: null,
        leadgenFormName: null,
      }
    );
  });
}

function normalizeDestinationRecord(destination: DestinationRecord): DestinationRecord {
  return {
    ...destination,
    pairAssignments: syncPairAssignments(destination.pairIds, destination.pairAssignments ?? []),
  };
}

function normalizeCampaignStatus(status: string | null | undefined) {
  const normalized = status?.trim().toUpperCase() ?? "";
  return normalized === "ACTIVE";
}

function getDestinationActiveAdsets(destination: DestinationRecord) {
  return destination.applyToAllAdsets
    ? destination.adsets
    : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));
}

function getDestinationPageIds(destination: DestinationRecord) {
  return Array.from(
    new Set(
      getDestinationActiveAdsets(destination)
        .map((adset) => adset.destination.pageId)
        .filter((pageId): pageId is string => Boolean(pageId)),
    ),
  );
}

function getPageIdsFromAdsets(adsets: AdsetRecord[]) {
  return Array.from(
    new Set(adsets.map((adset) => adset.destination.pageId).filter((pageId): pageId is string => Boolean(pageId))),
  );
}

function filterLeadformOptions(options: LeadformOption[], searchTerm: string) {
  const normalized = searchTerm.trim().toLowerCase();
  if (!normalized) {
    return options;
  }

  return options.filter((option) => {
    return `${option.name} ${option.metaFormId}`.toLowerCase().includes(normalized);
  });
}

function upsertDestination(destinations: DestinationRecord[], nextDestination: DestinationRecord) {
  const next = [...destinations];
  const index = next.findIndex(
    (destination) =>
      destination.resourceId === nextDestination.resourceId &&
      destination.campaign.id === nextDestination.campaign.id,
  );

  if (index >= 0) {
    next[index] = nextDestination;
  } else {
    next.push(nextDestination);
  }

  return next;
}

const restrictDragOverlayToViewport: Modifier = ({ transform, draggingNodeRect }) => {
  if (!draggingNodeRect) {
    return transform;
  }

  const viewportPadding = 8;
  const minX = viewportPadding - draggingNodeRect.left;
  const maxX = window.innerWidth - viewportPadding - draggingNodeRect.right;

  return {
    ...transform,
    x: Math.min(Math.max(transform.x, minX), maxX),
  };
};

function PairPreview({
  pair,
  compact = false,
}: {
  pair: PairView;
  compact?: boolean;
}) {
  return (
    <div className="flex justify-center">
      {pair.feedThumbnailUrl ? (
        <img
          src={pair.feedThumbnailUrl}
          alt=""
          className={cn(
            "rounded-md object-contain",
            compact ? "h-14 w-auto max-w-[5.5rem]" : "h-20 w-auto max-w-[7rem]",
          )}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <div
          className={cn(
            "flex items-center justify-center rounded-md border bg-muted/20 px-3 text-xs text-muted-foreground",
            compact ? "h-14 min-w-[5.5rem]" : "h-20 min-w-[7rem]",
          )}
        >
          Feed
        </div>
      )}
    </div>
  );
}

function SourcePairCard({
  pair,
  usageCount,
}: {
  pair: PairView;
  usageCount: number;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `source:${pair.pairId}`,
    data: {
      type: "pair",
      pairId: pair.pairId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "flex w-full min-w-0 max-w-full touch-none select-none items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 transition hover:border-blue-200 hover:shadow-sm cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <PairPreview pair={pair} compact />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">
          {`Par ${pair.position + 1}`}
        </div>
        <div className="text-[11px] text-slate-500">Feed + Stories</div>
        <div className="mt-1 text-[11px] text-slate-500">Usado {usageCount}x</div>
      </div>
    </div>
  );
}

function AssignedPairChip({
  pair,
  usageCount,
  onRemove,
}: {
  pair: PairView;
  usageCount: number;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `assigned:${pair.pairId}`,
    data: {
      type: "pair",
      pairId: pair.pairId,
    },
  });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group inline-flex max-w-full touch-none select-none items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 transition hover:border-blue-200 hover:shadow-sm cursor-grab active:cursor-grabbing",
        isDragging && "opacity-50",
      )}
    >
      <PairPreview pair={pair} compact />
      <div className="min-w-0">
        <div className="max-w-[120px] truncate text-xs font-medium text-slate-900">
          {`Par ${pair.position + 1}`}
        </div>
        <div className="text-[10px] text-slate-500">{usageCount} uso(s)</div>
      </div>
      <button
        type="button"
        className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 transition hover:text-slate-900"
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        x
      </button>
    </div>
  );
}

function CampaignDropZone({
  campaignKey,
  isEmpty,
  dragActive,
  isValid,
  children,
}: {
  campaignKey: string;
  isEmpty: boolean;
  dragActive: boolean;
  isValid: boolean;
  children: ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `drop:${campaignKey}`,
    data: {
      type: "campaign-dropzone",
      campaignKey,
    },
    disabled: !isValid,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "rounded-2xl border-2 border-dashed p-4 transition",
        dragActive && isValid && !isOver && "border-blue-200 bg-blue-50/40",
        dragActive && !isValid && "opacity-45",
        isOver && isValid ? "border-blue-500 bg-blue-50" : "border-border/70 bg-muted/10",
        isEmpty && "min-h-28",
      )}
    >
      {children}
    </div>
  );
}

export default function TaskDistributionPage({ taskId }: TaskDistributionProps) {
  const [, navigate] = useLocation();
  const [distributionDraft, setDistributionDraft] = useState<DistributionState>({
    destinations: [],
  });
  const distributionDraftRef = useRef<DistributionState>({
    destinations: [],
  });
  const [selectedAccounts, setSelectedAccounts] = useState<AccountSearchItem[]>([]);
  const [accountBlocks, setAccountBlocks] = useState<Record<number, AccountBlock>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("visual");
  const [activeDragPairId, setActiveDragPairId] = useState<string | null>(null);
  const [openCampaignKey, setOpenCampaignKey] = useState<string | null>(null);
  const [leadformsByPageId, setLeadformsByPageId] = useState<Record<string, LeadformOption[]>>({});
  const [leadformsLoadingByPageId, setLeadformsLoadingByPageId] = useState<Record<string, boolean>>({});
  const [leadformsErrorByPageId, setLeadformsErrorByPageId] = useState<Record<string, string | null>>({});
  const [campaignLeadformSearchByKey, setCampaignLeadformSearchByKey] = useState<Record<string, string>>({});
  const [pairLeadformSearchByKey, setPairLeadformSearchByKey] = useState<Record<string, string>>({});
  const [leadformPickerTarget, setLeadformPickerTarget] = useState<LeadformPickerTarget | null>(null);
  const [leadformPickerSearch, setLeadformPickerSearch] = useState("");
  const availablePairsScrollRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  const leadformPickerOptions = useMemo(
    () => filterLeadformOptions(leadformPickerTarget?.options ?? [], leadformPickerSearch),
    [leadformPickerSearch, leadformPickerTarget],
  );

  const detailQuery = useQuery<DistributionDetail>({
    queryKey: [`/api/tasks/${taskId}/distribution`],
  });

  useEffect(() => {
    let stopped = false;

    async function sendActivity() {
      if (stopped || document.visibilityState !== "visible") {
        return;
      }
      try {
        await apiRequest("POST", `/api/tasks/${taskId}/activity`, {});
      } catch {
        // Activity tracking is best-effort and must not interrupt distribution.
      }
    }

    void sendActivity();
    const intervalId = window.setInterval(sendActivity, 30_000);
    return () => {
      stopped = true;
      window.clearInterval(intervalId);
    };
  }, [taskId]);

  const accountsQuery = useQuery<{ accounts: AccountSearchItem[] }>({
    queryKey: ["task-distribution-account-search", taskId, searchTerm],
    enabled: searchOpen,
    queryFn: async () => {
      const query = searchTerm.trim();
      const suffix = query ? `?q=${encodeURIComponent(query)}` : "";
      const response = await apiRequest("GET", `/api/tasks/${taskId}/meta/accounts${suffix}`);
      return response.json();
    },
  });


  const saveDistributionMutation = useMutation({
    mutationFn: async (distribution: DistributionState) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}/distribution`, distribution);
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.setQueryData<DistributionDetail | undefined>([`/api/tasks/${taskId}/distribution`], (current) =>
        current
          ? {
              ...current,
              distribution: result?.distribution ?? current.distribution,
              updatedAt: typeof result?.updatedAt === "string" ? result.updatedAt : current.updatedAt,
            }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao salvar distribuicao",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  function openLeadformPicker(target: LeadformPickerTarget) {
    setLeadformPickerTarget(target);
    setLeadformPickerSearch("");
  }

  function closeLeadformPicker() {
    setLeadformPickerTarget(null);
    setLeadformPickerSearch("");
  }

  function applyLeadformSelection(value: string) {
    if (!leadformPickerTarget) {
      return;
    }

    const selectedOption = leadformPickerTarget.options.find((option) => option.metaFormId === value);

    if (leadformPickerTarget.mode === "campaign") {
      updateCampaignLeadformSelection(
        leadformPickerTarget.account,
        leadformPickerTarget.campaign,
        value === "__latest" ? null : selectedOption?.metaFormId ?? null,
        value === "__latest" ? null : selectedOption?.name ?? null,
      );
    } else {
      updatePairLeadformSelection(
        leadformPickerTarget.account,
        leadformPickerTarget.campaign,
        leadformPickerTarget.pairId,
        false,
        value === "__latest" ? null : selectedOption?.metaFormId ?? null,
        value === "__latest" ? null : selectedOption?.name ?? null,
      );
    }

    closeLeadformPicker();
  }

  const detail = detailQuery.data;
  const pairs = detail?.pairs ?? [];
  const pairById = useMemo(() => new Map(pairs.map((pair) => [pair.pairId, pair])), [pairs]);

  useLayoutEffect(() => {
    if (!activeDragPairId) {
      return;
    }

    const main = document.querySelector("main");
    const availablePairsScroll = availablePairsScrollRef.current;
    const previousBodyOverflowX = document.body.style.overflowX;
    const previousRootOverflowX = document.documentElement.style.overflowX;
    const previousMainOverflowX = main instanceof HTMLElement ? main.style.overflowX : "";
    let animationFrame = 0;

    document.body.style.overflowX = "hidden";
    document.documentElement.style.overflowX = "hidden";
    if (main instanceof HTMLElement) {
      main.style.overflowX = "hidden";
    }

    const lockHorizontalScroll = () => {
      if (availablePairsScroll && availablePairsScroll.scrollLeft !== 0) {
        availablePairsScroll.scrollLeft = 0;
      }
      animationFrame = window.requestAnimationFrame(lockHorizontalScroll);
    };
    lockHorizontalScroll();

    return () => {
      window.cancelAnimationFrame(animationFrame);
      document.body.style.overflowX = previousBodyOverflowX;
      document.documentElement.style.overflowX = previousRootOverflowX;
      if (main instanceof HTMLElement) {
        main.style.overflowX = previousMainOverflowX;
      }
    };
  }, [activeDragPairId]);

  useEffect(() => {
    distributionDraftRef.current = distributionDraft;
  }, [distributionDraft]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setDistributionDraft({
      destinations: detail.distribution.destinations.map(normalizeDestinationRecord),
    });

    const accountsMap = new Map<number, AccountSearchItem>();
    detail.distribution.destinations.forEach((destination) => {
      accountsMap.set(destination.resourceId, {
        resourceId: destination.resourceId,
        name: destination.adAccountName,
        adAccountId: destination.adAccountId,
        connectionStatus: destination.connectionStatus,
      });
    });
    setSelectedAccounts((current) => {
      const merged = new Map(current.map((account) => [account.resourceId, account]));
      accountsMap.forEach((account, resourceId) => {
        merged.set(resourceId, account);
      });
      return Array.from(merged.values());
    });
  }, [detail]);

  useEffect(() => {
    const pageIds = Array.from(
      new Set(
        [
          ...distributionDraft.destinations.flatMap((destination) => getDestinationPageIds(destination)),
          ...Object.values(accountBlocks).flatMap((block) =>
            block.campaigns.flatMap((campaign) => getPageIdsFromAdsets(campaign.adsets)),
          ),
        ].filter((pageId, index, all) => all.indexOf(pageId) === index),
      ),
    );

    pageIds.forEach((pageId) => {
      if (leadformsByPageId[pageId] || leadformsLoadingByPageId[pageId]) {
        return;
      }

      setLeadformsLoadingByPageId((current) => ({ ...current, [pageId]: true }));
      setLeadformsErrorByPageId((current) => ({ ...current, [pageId]: null }));

      void apiRequest("GET", `/api/meta/pages/${encodeURIComponent(pageId)}/leadforms`)
        .then((response) => response.json())
        .then((payload: Array<{
          id: number;
          name: string;
          value: string;
          metadata?: { status?: string | null; createdTime?: string | null };
        }>) => {
          setLeadformsByPageId((current) => ({
            ...current,
            [pageId]: Array.isArray(payload)
              ? payload
                  .map((item) => ({
                    resourceId: item.id,
                    metaFormId: item.value,
                    name: item.name,
                    status: item.metadata?.status ?? null,
                    createdTime: item.metadata?.createdTime ?? null,
                  }))
                  .sort((a, b) => {
                    const aTime = a.createdTime ? Date.parse(a.createdTime) : Number.NaN;
                    const bTime = b.createdTime ? Date.parse(b.createdTime) : Number.NaN;
                    return (Number.isFinite(bTime) ? bTime : 0) - (Number.isFinite(aTime) ? aTime : 0);
                  })
              : [],
          }));
        })
        .catch((error: Error) => {
          setLeadformsErrorByPageId((current) => ({
            ...current,
            [pageId]: error.message || "Falha ao carregar formularios da pagina.",
          }));
        })
        .finally(() => {
          setLeadformsLoadingByPageId((current) => ({ ...current, [pageId]: false }));
        });
    });
  }, [accountBlocks, distributionDraft.destinations, leadformsByPageId, leadformsLoadingByPageId, taskId]);

  async function loadAccountCampaigns(account: AccountSearchItem, force = false) {
    if (!force && accountBlocks[account.resourceId]) {
      return;
    }

    setAccountBlocks((current) => ({
      ...current,
      [account.resourceId]: {
        resourceId: account.resourceId,
        name: account.name,
        adAccountId: account.adAccountId,
        connectionStatus: account.connectionStatus,
        campaignCount: current[account.resourceId]?.campaignCount ?? 0,
        campaigns: current[account.resourceId]?.campaigns ?? [],
        isLoading: true,
        error: null,
      },
    }));

    try {
      const response = await apiRequest(
        "GET",
        `/api/tasks/${taskId}/meta/accounts/${account.resourceId}/campaigns`,
      );
      const payload = (await response.json()) as AccountCampaignResponse;
      setAccountBlocks((current) => ({
        ...current,
        [account.resourceId]: {
          resourceId: payload.account.resourceId,
          name: payload.account.name,
          adAccountId: payload.account.adAccountId,
          connectionStatus: payload.account.connectionStatus,
          campaignCount: payload.account.campaignCount,
          campaigns: payload.campaigns,
          isLoading: false,
          error: null,
        },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao carregar campanhas.";
      setAccountBlocks((current) => ({
        ...current,
        [account.resourceId]: {
          resourceId: account.resourceId,
          name: account.name,
          adAccountId: account.adAccountId,
          connectionStatus: account.connectionStatus,
          campaignCount: 0,
          campaigns: current[account.resourceId]?.campaigns ?? [],
          isLoading: false,
          error: message,
        },
      }));
    }
  }

  useEffect(() => {
    selectedAccounts.forEach((account) => {
      if (!accountBlocks[account.resourceId]) {
        void loadAccountCampaigns(account);
      }
    });
  }, [accountBlocks, selectedAccounts]);

  const allLoadedCampaigns = useMemo<LoadedCampaignRef[]>(() => {
    return selectedAccounts.flatMap((account) =>
      (accountBlocks[account.resourceId]?.campaigns ?? []).map((campaign) => ({
        account,
        campaign,
      })),
    );
  }, [accountBlocks, selectedAccounts]);

  const campaignLookup = useMemo(() => {
    const map = new Map<string, LoadedCampaignRef>();
    allLoadedCampaigns.forEach((entry) => {
      map.set(makeCampaignKey(entry.account.resourceId, entry.campaign.id), entry);
    });
    return map;
  }, [allLoadedCampaigns]);

  const pairUsageCount = useMemo(() => {
    const counts = new Map<string, number>();
    distributionDraft.destinations.forEach((destination) => {
      destination.pairIds.forEach((pairId) => {
        counts.set(pairId, (counts.get(pairId) ?? 0) + 1);
      });
    });
    return counts;
  }, [distributionDraft.destinations]);

  function applyDistribution(next: DistributionState) {
    const normalized = {
      destinations: next.destinations.map(normalizeDestinationRecord),
    };
    distributionDraftRef.current = normalized;
    setDistributionDraft(normalized);
    saveDistributionMutation.mutate(normalized);
  }

  function withDestination(
    account: AccountSearchItem,
    campaign: CampaignOption,
    updater: (destination: DestinationRecord) => DestinationRecord,
  ) {
    const existing =
      distributionDraftRef.current.destinations.find(
        (destination) =>
          destination.resourceId === account.resourceId && destination.campaign.id === campaign.id,
      ) ?? buildDestination(account, campaign);

    const next = upsertDestination(distributionDraftRef.current.destinations, updater(existing));
    applyDistribution({ destinations: next });
  }

  function ensureUniquePairIds(pairIds: string[]) {
    return Array.from(new Set(pairIds));
  }

  function upsertCampaignInAccountBlock(resourceId: number, nextCampaign: CampaignOption) {
    setAccountBlocks((current) => {
      const accountBlock = current[resourceId];
      if (!accountBlock) {
        return current;
      }

      const nextCampaigns = [...accountBlock.campaigns];
      const index = nextCampaigns.findIndex((campaign) => campaign.id === nextCampaign.id);
      if (index >= 0) {
        nextCampaigns[index] = nextCampaign;
      } else {
        nextCampaigns.push(nextCampaign);
      }

      return {
        ...current,
        [resourceId]: {
          ...accountBlock,
          campaigns: nextCampaigns,
        },
      };
    });
  }

  async function refreshCampaignContext(account: AccountSearchItem, campaign: CampaignOption) {
    const response = await apiRequest(
      "GET",
      `/api/tasks/${taskId}/meta/accounts/${account.resourceId}/campaigns/${campaign.id}/context`,
    );
    const payload = (await response.json()) as CampaignContextResponse;
    upsertCampaignInAccountBlock(account.resourceId, payload.campaign);
    return payload.campaign;
  }

  async function assignPairToCampaign(account: AccountSearchItem, campaign: CampaignOption, pairId: string) {
    let nextCampaign = campaign;

    try {
      nextCampaign = await refreshCampaignContext(account, campaign);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel atualizar os dados da campanha na Meta.";
      toast({
        title: "Falha ao atualizar campanha",
        description: `${message} O par sera adicionado com os dados ja carregados.`,
        variant: "destructive",
      });
    }

    withDestination(account, nextCampaign, (destination) => ({
      ...buildDestination(account, nextCampaign, destination.pairIds),
      applyToAllAdsets: destination.applyToAllAdsets,
      selectedAdsetIds: destination.applyToAllAdsets
        ? nextCampaign.adsets.map((adset) => adset.id)
        : destination.selectedAdsetIds.filter((adsetId) =>
            nextCampaign.adsets.some((adset) => adset.id === adsetId),
          ),
      createAdsStatus: destination.createAdsStatus,
      pairIds: ensureUniquePairIds([...destination.pairIds, pairId]),
      pairAssignments: syncPairAssignments(
        ensureUniquePairIds([...destination.pairIds, pairId]),
        destination.pairAssignments,
      ),
    }));
  }

  function removePairFromCampaign(resourceId: number, campaignId: string, pairId: string) {
    const nextDestinations = distributionDraft.destinations.map((destination) => {
      if (destination.resourceId !== resourceId || destination.campaign.id !== campaignId) {
        return destination;
      }
      const nextPairIds = destination.pairIds.filter((id) => id !== pairId);
      return {
        ...destination,
        pairIds: nextPairIds,
        pairAssignments: syncPairAssignments(nextPairIds, destination.pairAssignments),
      };
    });
    applyDistribution({ destinations: nextDestinations });
  }

  function updatePairLeadformSelection(
    account: AccountSearchItem,
    campaign: CampaignOption,
    pairId: string,
    useCampaignDefault: boolean,
    leadgenFormId: string | null,
    leadgenFormName: string | null,
  ) {
    withDestination(account, campaign, (current) => ({
      ...current,
      pairAssignments: syncPairAssignments(current.pairIds, current.pairAssignments).map((assignment) =>
        assignment.pairId === pairId
          ? {
              ...assignment,
              useCampaignDefault,
              leadgenFormId,
              leadgenFormName,
            }
          : assignment,
      ),
    }));
  }

  function updateCampaignLeadformSelection(
    account: AccountSearchItem,
    campaign: CampaignOption,
    leadgenFormId: string | null,
    leadgenFormName: string | null,
  ) {
    withDestination(account, campaign, (current) => ({
      ...current,
      campaignLeadgenFormId: leadgenFormId,
      campaignLeadgenFormName: leadgenFormName,
    }));
  }

  function handleAddAccount(account: AccountSearchItem) {
    setSelectedAccounts((current) =>
      current.some((item) => item.resourceId === account.resourceId) ? current : [...current, account],
    );
    setSearchOpen(false);
    setSearchTerm("");
    void loadAccountCampaigns(account, true);
  }

  function handleRemoveAccount(resourceId: number) {
    setSelectedAccounts((current) => current.filter((account) => account.resourceId !== resourceId));
    setAccountBlocks((current) => {
      const next = { ...current };
      delete next[resourceId];
      return next;
    });
    applyDistribution({
      destinations: distributionDraft.destinations.filter((destination) => destination.resourceId !== resourceId),
    });
  }

  function handleDragStart(event: DragStartEvent) {
    if (availablePairsScrollRef.current) {
      availablePairsScrollRef.current.scrollLeft = 0;
    }

    const pairId = event.active.data.current?.pairId;
    setActiveDragPairId(typeof pairId === "string" ? pairId : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragPairId(null);
    const pairId = event.active.data.current?.pairId;
    const campaignKey = event.over?.data.current?.campaignKey;
    if (typeof pairId !== "string" || typeof campaignKey !== "string") {
      if (typeof pairId === "string") {
        toast({
          title: "Campanha invalida",
          description: "Solte o par dentro de uma campanha valida.",
          variant: "destructive",
        });
      }
      return;
    }

    const reference = campaignLookup.get(campaignKey);
    if (!reference) {
      return;
    }

    void assignPairToCampaign(reference.account, reference.campaign, pairId);
  }

  function handleDragCancel() {
    setActiveDragPairId(null);
  }

  function keepAvailablePairsScrollVertical(event: UIEvent<HTMLDivElement>) {
    if (event.currentTarget.scrollLeft !== 0) {
      event.currentTarget.scrollLeft = 0;
    }
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Carregando distribuicao...</p>
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={false}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <div className="min-h-full overflow-x-clip bg-slate-50 p-6">
        <div className="mx-auto space-y-6 max-w-[1600px]">
          <Card className="border-slate-200 bg-white shadow-sm">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">
                    Distribuir pares em campanhas
                  </CardTitle>
                  <CardDescription className="mt-2 text-sm text-slate-600">
                    Organize os pares por campanha, escolha o formulário padrão e ajuste apenas os casos que precisam de exceção.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant={viewMode === "visual" ? "default" : "outline"}
                    size="sm"
                    className={viewMode === "visual" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                    onClick={() => setViewMode("visual")}
                  >
                    Modo visual
                  </Button>
                  <Button
                    variant={viewMode === "matrix" ? "default" : "outline"}
                    size="sm"
                    className={viewMode === "matrix" ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                    onClick={() => setViewMode("matrix")}
                  >
                    Modo matriz
                  </Button>
                </div>
              </div>
            </CardHeader>
          </Card>

          <div className="grid min-w-0 items-start gap-6 overflow-x-clip lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="self-start lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)]">
            <Card className="border-slate-200 bg-white shadow-sm lg:flex lg:h-[calc(100vh-7rem)] lg:max-h-[calc(100vh-7rem)] lg:flex-col">
              <CardHeader>
                <CardTitle className="text-slate-900">Pares disponíveis</CardTitle>
                <CardDescription className="text-slate-600">
                  Arraste um par para a campanha desejada.
                </CardDescription>
              </CardHeader>
              <CardContent
                ref={availablePairsScrollRef}
                className="max-h-[70vh] space-y-3 overflow-y-auto overflow-x-clip overscroll-y-contain pr-2 lg:min-h-0 lg:max-h-none lg:flex-1"
                style={{ contain: "layout paint", overflowX: "clip", scrollbarGutter: "stable" }}
                onScroll={keepAvailablePairsScrollVertical}
              >
                {pairs.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Nenhum par pronto para distribuir.
                  </div>
                ) : (
                  pairs.map((pair) => (
                    <SourcePairCard
                      key={pair.pairId}
                      pair={pair}
                      usageCount={pairUsageCount.get(pair.pairId) ?? 0}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </aside>

          <div className="min-w-0 space-y-6">

            {viewMode === "matrix" ? (
              <Card>
                <CardHeader>
                  <CardTitle>Matriz de distribuicao</CardTitle>
                  <CardDescription>
                    Visualize rapidamente quais pares estao em quais campanhas.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {allLoadedCampaigns.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Carregue campanhas para visualizar a matriz.
                    </p>
                  ) : (
                    <div className="max-w-full overflow-x-auto">
                      <table className="min-w-full border-separate border-spacing-2">
                        <thead>
                          <tr>
                            <th className="min-w-[180px] px-3 py-2 text-left text-xs font-medium uppercase text-muted-foreground">
                              Par
                            </th>
                            {allLoadedCampaigns.map((entry) => {
                              const campaignKey = makeCampaignKey(entry.account.resourceId, entry.campaign.id);
                              return (
                                <th
                                  key={campaignKey}
                                  className="min-w-[180px] rounded-xl border bg-muted/10 px-3 py-2 text-left text-xs font-medium"
                                >
                                  <div>{entry.campaign.name ?? entry.campaign.id}</div>
                                  <div className="text-[11px] text-muted-foreground">{entry.account.name}</div>
                                </th>
                              );
                            })}
                          </tr>
                        </thead>
                        <tbody>
                          {pairs.map((pair) => (
                            <tr key={pair.pairId}>
                              <td className="rounded-xl border bg-background px-3 py-2">
                                <div className="font-medium">Par {pair.position + 1}</div>
                                <div className="text-xs text-muted-foreground">
                                  {pairUsageCount.get(pair.pairId) ?? 0} uso(s)
                                </div>
                              </td>
                              {allLoadedCampaigns.map((entry) => {
                                const destination = distributionDraft.destinations.find(
                                  (item) =>
                                    item.resourceId === entry.account.resourceId &&
                                    item.campaign.id === entry.campaign.id,
                                );
                                const assigned = destination?.pairIds.includes(pair.pairId) ?? false;
                                return (
                                  <td key={`${entry.campaign.id}:${pair.pairId}`} className="align-middle">
                                    <button
                                      type="button"
                                      className={cn(
                                        "flex h-full min-h-[56px] w-full items-center justify-center rounded-xl border text-sm transition",
                                        assigned
                                          ? "border-primary bg-primary/10 text-primary"
                                          : "border-border bg-background hover:border-primary/40",
                                      )}
                                      onClick={() => {
                                        if (assigned) {
                                          removePairFromCampaign(entry.account.resourceId, entry.campaign.id, pair.pairId);
                                          return;
                                        }
                                        void assignPairToCampaign(entry.account, entry.campaign, pair.pairId);
                                      }}
                                    >
                                      {assigned ? "✓" : ""}
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : selectedAccounts.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Adicione uma conta para abrir as campanhas ativas e transformar cada campanha em um destino independente.
                </CardContent>
              </Card>
            ) : (
              selectedAccounts.map((account) => {
                const block = accountBlocks[account.resourceId];
                return (
                  <Card key={account.resourceId} className="overflow-hidden border-slate-200 bg-white shadow-sm">
                    <CardHeader className="border-b border-slate-200 bg-slate-100/90">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <CardTitle className="text-lg text-slate-900">{account.name}</CardTitle>
                          <div className="text-sm text-slate-500">{account.adAccountId}</div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                              {account.connectionStatus === "connected" ? "Conectada" : "Desconectada"}
                            </Badge>
                            <span>{block?.campaignCount ?? 0} campanhas</span>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => void loadAccountCampaigns(account, true)}>
                            Atualizar campanhas
                          </Button>
                          <Button variant="outline" size="sm" onClick={() => handleRemoveAccount(account.resourceId)}>
                            Remover conta
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="p-0">
                      {block?.isLoading ? (
                        <div className="px-6 py-8 text-sm text-slate-500">Carregando campanhas...</div>
                      ) : block?.error ? (
                        <div className="px-6 py-8 text-sm text-destructive">{block.error}</div>
                      ) : (
                        <Accordion
                          type="single"
                          collapsible
                          className="w-full"
                          value={openCampaignKey ?? undefined}
                          onValueChange={(value) => setOpenCampaignKey(value || null)}
                        >
                          {(block?.campaigns ?? []).map((campaign) => {
                            const campaignKey = makeCampaignKey(account.resourceId, campaign.id);
                            const destination = distributionDraft.destinations.find(
                              (item) => item.resourceId === account.resourceId && item.campaign.id === campaign.id,
                            );
                            const assignedPairs = (destination?.pairIds ?? [])
                              .map((pairId) => pairById.get(pairId))
                              .filter((pair): pair is PairView => Boolean(pair));
                            const campaignPageIds = getPageIdsFromAdsets(destination?.adsets ?? campaign.adsets);
                            const selectedPageId = campaignPageIds.length === 1 ? campaignPageIds[0] : null;
                            const leadformOptions = selectedPageId ? leadformsByPageId[selectedPageId] ?? [] : [];
                            const campaignLeadformSearch = campaignLeadformSearchByKey[campaignKey] ?? "";
                            const filteredCampaignLeadformOptions = filterLeadformOptions(
                              leadformOptions,
                              campaignLeadformSearch,
                            );
                            const isLeadformsLoading = selectedPageId
                              ? Boolean(leadformsLoadingByPageId[selectedPageId])
                              : false;
                            const leadformsError = selectedPageId ? leadformsErrorByPageId[selectedPageId] : null;
                            const canDrop = campaign.adsetCount > 0 && account.connectionStatus === "connected";

                            return (
                              <AccordionItem key={campaign.id} value={campaignKey} className="border-b-0">
                                <AccordionTrigger className="px-6 py-4 hover:no-underline">
                                  <div className="flex w-full items-start gap-3 text-left">
                                    <Circle
                                      className={cn(
                                        "mt-1 h-3 w-3 shrink-0",
                                        normalizeCampaignStatus(campaign.status)
                                          ? "fill-emerald-500 text-emerald-500"
                                          : "fill-slate-300 text-slate-300",
                                      )}
                                    />
                                    <div className="min-w-0 flex-1">
                                      <div className="truncate font-medium text-slate-900">{campaign.name ?? campaign.id}</div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {(campaign.objective ?? "Sem objetivo")} | {(campaign.status ?? "Sem status")}
                                      </div>
                                      <div className="mt-1 text-xs text-slate-500">
                                        {campaign.adsetCount} conjuntos | {assignedPairs.length} pares
                                      </div>
                                    </div>
                                  </div>
                                </AccordionTrigger>
                                <AccordionContent className="px-6 pb-6">
                                  <div className="space-y-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                    <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                                      <div className="grid gap-3 md:grid-cols-1">
                                        <div className="hidden rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                                          <div className="text-[11px] uppercase tracking-wide text-slate-500">Página</div>
                                          <div className="mt-1">{selectedPageId ?? "Nao resolvida"}</div>
                                        </div>
                                        <div className="space-y-2 text-left">
                                          <div className="text-[11px] uppercase tracking-wide text-slate-500">Formulario padrão da campanha</div>
                                          {campaignPageIds.length > 1 ? (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                              Os conjuntos desta campanha usam mais de uma pagina.
                                            </div>
                                          ) : !selectedPageId ? (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                              Nenhuma pagina resolvida para esta campanha.
                                            </div>
                                          ) : isLeadformsLoading ? (
                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                              Carregando formularios...
                                            </div>
                                          ) : leadformsError ? (
                                            <div className="rounded-xl border bg-destructive/10 px-3 py-2 text-xs text-destructive">
                                              {leadformsError}
                                            </div>
                                          ) : (
                                            <>
                                              <button
                                                type="button"
                                                className="mb-2 flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 transition hover:border-slate-300"
                                                onClick={() =>
                                                  openLeadformPicker({
                                                    mode: "campaign",
                                                    account,
                                                    campaign,
                                                    options: leadformOptions,
                                                  })
                                                }
                                              >
                                                <span className="truncate">
                                                  {destination?.campaignLeadgenFormName ??
                                                    destination?.campaignLeadgenFormId ??
                                                    "Usar ultimo formulario da pagina"}
                                                </span>
                                                <span className="text-xs text-slate-400">Buscar</span>
                                              </button>
                                              <div className="hidden">
                                              <Input
                                                value={campaignLeadformSearch}
                                                onChange={(event) =>
                                                  setCampaignLeadformSearchByKey((current) => ({
                                                    ...current,
                                                    [campaignKey]: event.target.value,
                                                  }))
                                                }
                                                placeholder="Buscar formulario"
                                                className="mb-2 h-9 border-slate-200 bg-white"
                                              />
                                            <Select
                                              value={destination?.campaignLeadgenFormId ?? "__latest"}
                                              onValueChange={(value) => {
                                                const selectedOption = leadformOptions.find((option) => option.metaFormId === value);
                                                updateCampaignLeadformSelection(
                                                  account,
                                                  campaign,
                                                  value === "__latest" ? null : selectedOption?.metaFormId ?? null,
                                                  value === "__latest" ? null : selectedOption?.name ?? null,
                                                );
                                              }}
                                            >
                                              <SelectTrigger className="h-9 border-slate-200 bg-white text-left">
                                                <SelectValue placeholder="Escolha o formulario padrão" />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="__latest">Usar ultimo formulario da pagina</SelectItem>
                                                {filteredCampaignLeadformOptions.map((option) => (
                                                  <SelectItem key={option.metaFormId} value={option.metaFormId}>
                                                    {option.name}
                                                  </SelectItem>
                                                ))}
                                              </SelectContent>
                                            </Select>
                                              </div>
                                            </>
                                          )}
                                        </div>
                                      </div>
                                    </div>

                                    <div>
                                      <div className="text-sm font-medium text-slate-900">Área de distribuição</div>
                                      <div className="mt-3">
                                        <CampaignDropZone
                                          campaignKey={campaignKey}
                                          isEmpty={assignedPairs.length === 0}
                                          dragActive={activeDragPairId !== null}
                                          isValid={canDrop}
                                        >
                                          {assignedPairs.length === 0 ? (
                                            <div className="flex min-h-20 items-center justify-center text-sm text-slate-500">
                                              {canDrop ? "Arraste pares aqui" : "Campanha indisponivel para receber pares"}
                                            </div>
                                          ) : (
                                            <div className="min-w-0 space-y-3 overflow-x-hidden">
                                              {assignedPairs.map((pair) => {
                                                const pairAssignmentKey = makePairAssignmentKey(campaignKey, pair.pairId);
                                                const pairAssignment =
                                                  destination?.pairAssignments.find(
                                                    (assignment) => assignment.pairId === pair.pairId,
                                                  ) ?? null;
                                                const pairLeadformSearch = pairLeadformSearchByKey[pairAssignmentKey] ?? "";
                                                const filteredPairLeadformOptions = filterLeadformOptions(
                                                  leadformOptions,
                                                  pairLeadformSearch,
                                                );
                                                return (
                                                  <div
                                                    key={`${campaignKey}:${pair.pairId}`}
                                                    className="rounded-2xl border border-slate-200 bg-white p-3"
                                                  >
                                                    <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
                                                      <AssignedPairChip
                                                        pair={pair}
                                                        usageCount={pairUsageCount.get(pair.pairId) ?? 0}
                                                        onRemove={() =>
                                                          removePairFromCampaign(
                                                            account.resourceId,
                                                            campaign.id,
                                                            pair.pairId,
                                                          )
                                                        }
                                                      />
                                                      <div className="min-w-0 flex-1 basis-[260px] space-y-2">
                                                        <label className="flex items-center gap-2 text-xs text-slate-600">
                                                          <Checkbox
                                                            checked={pairAssignment?.useCampaignDefault !== false}
                                                            onCheckedChange={(checked) =>
                                                              updatePairLeadformSelection(
                                                                account,
                                                                campaign,
                                                                pair.pairId,
                                                                checked !== false,
                                                                checked !== false ? null : pairAssignment?.leadgenFormId ?? null,
                                                                checked !== false ? null : pairAssignment?.leadgenFormName ?? null,
                                                              )
                                                            }
                                                          />
                                                          Usar formulário da campanha
                                                        </label>
                                                        {pairAssignment?.useCampaignDefault === false ? (
                                                          campaignPageIds.length > 1 ? (
                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                                              Ajuste os conjuntos para usar um único page_id antes do override por par.
                                                            </div>
                                                          ) : !selectedPageId ? (
                                                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                                              Nenhuma página resolvida para este par.
                                                            </div>
                                                          ) : (
                                                            <>
                                                              <button
                                                                type="button"
                                                                className="mb-2 flex h-10 w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm text-slate-700 transition hover:border-slate-300"
                                                                onClick={() =>
                                                                  openLeadformPicker({
                                                                    mode: "pair",
                                                                    account,
                                                                    campaign,
                                                                    pairId: pair.pairId,
                                                                    options: leadformOptions,
                                                                  })
                                                                }
                                                              >
                                                                <span className="truncate">
                                                                  {pairAssignment?.leadgenFormName ??
                                                                    pairAssignment?.leadgenFormId ??
                                                                    "Usar ultimo formulario da pagina"}
                                                                </span>
                                                                <span className="text-xs text-slate-400">Buscar</span>
                                                              </button>
                                                              <div className="hidden">
                                                              <Input
                                                                value={pairLeadformSearch}
                                                                onChange={(event) =>
                                                                  setPairLeadformSearchByKey((current) => ({
                                                                    ...current,
                                                                    [pairAssignmentKey]: event.target.value,
                                                                  }))
                                                                }
                                                                placeholder="Buscar formulario"
                                                                className="mb-2 h-9 border-slate-200 bg-white"
                                                              />
                                                            <Select
                                                              value={pairAssignment?.leadgenFormId ?? "__latest"}
                                                              onValueChange={(value) => {
                                                                const selectedOption = leadformOptions.find((option) => option.metaFormId === value);
                                                                updatePairLeadformSelection(
                                                                  account,
                                                                  campaign,
                                                                  pair.pairId,
                                                                  false,
                                                                  value === "__latest" ? null : selectedOption?.metaFormId ?? null,
                                                                  value === "__latest" ? null : selectedOption?.name ?? null,
                                                                );
                                                              }}
                                                            >
                                                              <SelectTrigger className="h-9 border-slate-200 bg-white text-left">
                                                                <SelectValue placeholder="Formulario deste par" />
                                                              </SelectTrigger>
                                                              <SelectContent>
                                                                <SelectItem value="__latest">Usar ultimo formulario da pagina</SelectItem>
                                                                {filteredPairLeadformOptions.map((option) => (
                                                                  <SelectItem key={option.metaFormId} value={option.metaFormId}>
                                                                    {option.name}
                                                                  </SelectItem>
                                                                ))}
                                                              </SelectContent>
                                                            </Select>
                                                              </div>
                                                            </>
                                                          )
                                                        ) : (
                                                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                                                            {destination?.campaignLeadgenFormName ??
                                                              destination?.campaignLeadgenFormId ??
                                                              "Usa o ultimo formulario da pagina"}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          )}
                                        </CampaignDropZone>
                                      </div>
                                    </div>

                                    <div className="space-y-3">
                                      <div className="text-sm font-medium text-slate-900">Conjuntos de anuncios</div>
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={destination?.applyToAllAdsets !== false ? "default" : "outline"}
                                            className={destination?.applyToAllAdsets !== false ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                                            onClick={() =>
                                              withDestination(account, campaign, (current) => ({
                                                ...current,
                                                applyToAllAdsets: true,
                                                selectedAdsetIds: current.adsets.map((adset) => adset.id),
                                              }))
                                            }
                                          >
                                            Todos os conjuntos
                                          </Button>
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant={destination?.applyToAllAdsets === false ? "default" : "outline"}
                                            className={destination?.applyToAllAdsets === false ? "bg-blue-600 text-white hover:bg-blue-700" : ""}
                                            onClick={() =>
                                              withDestination(account, campaign, (current) => ({
                                                ...current,
                                                applyToAllAdsets: false,
                                                selectedAdsetIds:
                                                  current.selectedAdsetIds.length > 0
                                                    ? current.selectedAdsetIds
                                                    : current.adsets.map((adset) => adset.id),
                                              }))
                                            }
                                          >
                                            Escolher conjuntos
                                          </Button>
                                        </div>

                                        <div className="grid gap-2">
                                          {campaign.adsets.map((adset) => (
                                            <div
                                              key={adset.id}
                                              className={cn(
                                                "flex items-center justify-between rounded-xl border border-slate-200 px-3 py-3",
                                                destination?.applyToAllAdsets === false ? "bg-white" : "bg-slate-50",
                                              )}
                                            >
                                              <div className="flex min-w-0 items-center gap-2">
                                                <Circle
                                                  className={cn(
                                                    "h-2.5 w-2.5 shrink-0",
                                                    normalizeCampaignStatus(adset.status)
                                                      ? "fill-emerald-500 text-emerald-500"
                                                      : "fill-slate-300 text-slate-300",
                                                  )}
                                                />
                                                <div className="truncate text-sm text-slate-800">{adset.name ?? adset.id}</div>
                                              </div>
                                              <Checkbox
                                                checked={
                                                  destination?.applyToAllAdsets !== false ||
                                                  Boolean(destination?.selectedAdsetIds.includes(adset.id))
                                                }
                                                disabled={destination?.applyToAllAdsets !== false}
                                                onCheckedChange={(checked) =>
                                                  withDestination(account, campaign, (current) => ({
                                                    ...current,
                                                    selectedAdsetIds: checked
                                                      ? ensureUniquePairIds([...current.selectedAdsetIds, adset.id])
                                                      : current.selectedAdsetIds.filter((id) => id !== adset.id),
                                                  }))
                                                }
                                              />
                                            </div>
                                          ))}
                                        </div>
                                    </div>
                                  </div>
                                </AccordionContent>
                              </AccordionItem>
                            );
                          })}
                        </Accordion>
                      )}
                    </CardContent>
                  </Card>
                );
              })
            )}

            <Card className="border-slate-300 bg-slate-100/70 shadow-sm">
              <CardContent className="space-y-4 p-5">
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-slate-300 bg-white text-slate-700 transition hover:border-blue-200 hover:text-blue-700"
                    onClick={() => setSearchOpen((current) => !current)}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                  <div>
                    <div className="text-sm font-semibold text-slate-900">Adicionar outra conta</div>
                    <div className="text-xs text-slate-500">
                      Busque uma conta Meta e carregue suas campanhas.
                    </div>
                  </div>
                </div>

                {searchOpen ? (
                  <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <Input
                      value={searchTerm}
                      onChange={(event) => setSearchTerm(event.target.value)}
                      placeholder="Buscar conta por nome ou ID"
                      className="border-slate-200"
                    />

                    {accountsQuery.isLoading ? (
                      <div className="text-sm text-slate-500">Carregando contas...</div>
                    ) : accountsQuery.isError ? (
                      <div className="text-sm text-destructive">Nao foi possivel buscar as contas.</div>
                    ) : (
                      <div className="space-y-2">
                        {(accountsQuery.data?.accounts ?? []).length === 0 ? (
                          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
                            Nenhuma conta encontrada.
                          </div>
                        ) : (
                          (accountsQuery.data?.accounts ?? []).map((account) => (
                            <button
                              key={account.resourceId}
                              type="button"
                              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-blue-200 hover:bg-blue-50/50"
                              onClick={() => handleAddAccount(account)}
                            >
                              <div>
                                <div className="text-sm font-medium text-slate-900">{account.name}</div>
                                <div className="text-xs text-slate-500">{account.adAccountId}</div>
                              </div>
                              <Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-600">
                                {account.connectionStatus === "connected" ? "Conectada" : "Desconectada"}
                              </Badge>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white shadow-sm">
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                <div className="text-sm text-slate-500">
                  Quando terminar a distribuicao, siga para a revisao final em uma pagina separada.
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" onClick={() => navigate(`/tasks/${taskId}`)}>
                    Voltar
                  </Button>
                  <Button
                    className="bg-blue-600 text-white hover:bg-blue-700"
                    onClick={() => navigate(`/tasks/${taskId}/distribution/review`)}
                  >
                    Seguir Revisao
                  </Button>
                </div>
              </CardContent>
            </Card>
            {/*
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="text-sm text-slate-500">
                    Revise a distribuicao final antes de publicar. Esta etapa mostra contas, campanhas, conjuntos, pares e formularios envolvidos.
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => navigate(`/tasks/${taskId}`)}>
                      Voltar
                    </Button>
                    <Button
                      className="bg-blue-600 text-white hover:bg-blue-700"
                      onClick={() => setStage("review")}
                    >
                      Seguir Revisão
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <Card className="border-slate-200 bg-white shadow-sm">
                <CardHeader>
                  <CardTitle className="text-slate-900">Revisão final</CardTitle>
                  <CardDescription className="text-slate-600">
                    Valide a tarefa completa antes de enviar ao n8n.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="grid gap-3 md:grid-cols-4">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Tarefa</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{detail.title}</div>
                      <div className="mt-1 text-xs text-slate-500">Status: {detail.status}</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Contas e campanhas</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {reviewAccountGroups.length} conta(s)
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{reviewDestinations.length} campanha(s)</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Pares e conjuntos</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">
                        {reviewUniquePairIds.length} par(es)
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{reviewAdsetCount} conjunto(s)</div>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Total de jobs</div>
                      <div className="mt-2 text-sm font-semibold text-slate-900">{reviewJobCount}</div>
                      <div className="mt-1 text-xs text-slate-500">anúncio(s) a publicar</div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm font-medium text-slate-900">Resumo geral</div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Pares atribuídos</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reviewUniquePairIds.length === 0 ? (
                            <span className="text-xs text-slate-500">Nenhum par atribuído.</span>
                          ) : (
                            reviewUniquePairIds.map((pairId) => {
                              const pair = pairById.get(pairId);
                              if (!pair) return null;
                              return (
                                <Badge key={pairId} variant="outline">
                                  Par {pair.position + 1}
                                </Badge>
                              );
                            })
                          )}
                        </div>
                      </div>
                      <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="text-[11px] uppercase tracking-wide text-slate-500">Formulários usados</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {reviewFormsUsed.length === 0 ? (
                            <span className="text-xs text-slate-500">Nenhum formulário identificado.</span>
                          ) : (
                            reviewFormsUsed.map((form) => (
                              <Badge key={form} variant="outline">
                                {form}
                              </Badge>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {reviewAccountGroups.length === 0 ? (
                      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                        Nenhuma configuracao pronta para envio. Associe ao menos um par a uma campanha com conjuntos disponiveis.
                      </div>
                    ) : (
                      reviewAccountGroups.map((accountGroup) => (
                        <div key={accountGroup.resourceId} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                              <div className="font-semibold text-slate-900">{accountGroup.adAccountName}</div>
                              <div className="text-xs text-slate-500">{accountGroup.adAccountId}</div>
                            </div>
                            <Badge variant="outline">{accountGroup.campaigns.length} campanha(s)</Badge>
                          </div>

                          <div className="mt-4 space-y-3">
                            {accountGroup.campaigns.map((destination) => {
                              const selectedAdsets = destination.applyToAllAdsets
                                ? destination.adsets
                                : destination.adsets.filter((adset) => destination.selectedAdsetIds.includes(adset.id));
                              return (
                                <div key={`${destination.resourceId}:${destination.campaign.id}`} className="rounded-xl border border-slate-200 bg-white p-4">
                                  <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                      <div className="font-medium text-slate-900">{destination.campaign.name ?? destination.campaign.id}</div>
                                      <div className="text-xs text-slate-500">
                                        {destination.campaign.objective ?? "Sem objetivo"} | {selectedAdsets.length} conjunto(s) | {destination.pairIds.length} par(es)
                                      </div>
                                    </div>
                                    <Badge variant="outline">{destination.createAdsStatus}</Badge>
                                  </div>

                                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Conjuntos envolvidos</div>
                                      <div className="mt-2 flex flex-wrap gap-2">
                                        {selectedAdsets.map((adset) => (
                                          <Badge key={adset.id} variant="secondary" className="max-w-full">
                                            {adset.name ?? adset.id}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                                      <div className="text-[11px] uppercase tracking-wide text-slate-500">Pares e formulários</div>
                                      <div className="mt-2 space-y-2">
                                        {destination.pairIds.map((pairId) => {
                                          const pair = pairById.get(pairId);
                                          const pairAssignment =
                                            destination.pairAssignments.find((assignment) => assignment.pairId === pairId) ?? null;
                                          if (!pair) return null;
                                          return (
                                            <div key={pairId} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                              <div className="flex items-center gap-2">
                                                <PairPreview pair={pair} compact />
                                                <span className="text-sm font-medium text-slate-900">Par {pair.position + 1}</span>
                                              </div>
                                              <span className="text-xs text-slate-500">
                                                {pairAssignment?.leadgenFormName ??
                                                  pairAssignment?.leadgenFormId ??
                                                  destination.campaignLeadgenFormName ??
                                                  destination.campaignLeadgenFormId ??
                                                  "Ultimo formulario da pagina"}
                                              </span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <div className="text-sm font-medium text-amber-900">Alertas</div>
                      <div className="mt-2 space-y-2 text-sm text-amber-800">
                        {reviewAlerts.length === 0 ? (
                          <div>Nenhum alerta.</div>
                        ) : (
                          reviewAlerts.map((alert) => <div key={alert}>• {alert}</div>)
                        )}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
                      <div className="text-sm font-medium text-rose-900">Erros</div>
                      <div className="mt-2 space-y-2 text-sm text-rose-800">
                        {reviewErrors.length === 0 ? (
                          <div>Nenhum erro bloqueante.</div>
                        ) : (
                          reviewErrors.map((error) => <div key={error}>• {error}</div>)
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="text-sm text-slate-500">
                      O envio usa o `n8nWebhookUrl` configurado em `Admin`. Os dados são montados no backend e enviados apenas ao publicar.
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" onClick={() => setStage("distribution")}>
                        Voltar
                      </Button>
                      <Button
                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                        onClick={() => sendToN8nMutation.mutate()}
                        disabled={sendToN8nMutation.isPending || reviewAccountGroups.length === 0 || reviewErrors.length > 0}
                      >
                        {sendToN8nMutation.isPending ? "Publicando..." : "Publicar"}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            */}
          </div>
        </div>
      </div>
      </div>

      <CommandDialog open={Boolean(leadformPickerTarget)} onOpenChange={(open) => !open && closeLeadformPicker()}>
        <div className="border-b px-4 py-3">
          <div className="text-sm font-medium text-slate-900">
            {leadformPickerTarget?.mode === "pair" ? "Formulario deste par" : "Formulario da campanha"}
          </div>
          <div className="text-xs text-slate-500">
            Digite para buscar e selecione o formulario desejado.
          </div>
        </div>
        <CommandInput
          value={leadformPickerSearch}
          onValueChange={setLeadformPickerSearch}
          placeholder="Buscar formulario"
        />
        <CommandList>
          <CommandEmpty>Nenhum formulario encontrado.</CommandEmpty>
          <CommandGroup heading="Opcoes">
            <CommandItem value="usar ultimo formulario da pagina" onSelect={() => applyLeadformSelection("__latest")}>
              Usar ultimo formulario da pagina
            </CommandItem>
            {leadformPickerOptions.map((option) => (
              <CommandItem
                key={option.metaFormId}
                value={`${option.name} ${option.metaFormId}`}
                onSelect={() => applyLeadformSelection(option.metaFormId)}
              >
                <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                  <span className="truncate">{option.name}</span>
                  <span className="shrink-0 text-[10px] text-slate-400">{option.metaFormId}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>

      {createPortal(
        <DragOverlay modifiers={[restrictDragOverlayToViewport]}>
          {activeDragPairId && pairById.get(activeDragPairId) ? (
            <div className="inline-flex pointer-events-none items-center gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl">
              <div className="text-xs font-medium text-slate-900">
                Par {(pairById.get(activeDragPairId)?.position ?? 0) + 1}
              </div>
              <PairPreview pair={pairById.get(activeDragPairId)!} compact />
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}
