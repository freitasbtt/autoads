import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ChevronDown } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";

type TaskDetailProps = {
  taskId: string;
};

type UploadItem = {
  id: number;
  originalFileName: string;
  contentType: string;
  sizeBytes: number;
  objectPath: string;
  createdAt: string;
  thumbnailUrl: string | null;
};

type TaskPair = {
  feedUploadId: number | null;
  storiesUploadId: number | null;
  title: string | null;
  text: string | null;
};

type DraftPair = {
  feedUploadId: number | null;
  storiesUploadId: number | null;
  title: string;
  text: string;
};

type TaskDetail = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  completePairCount?: number;
  pairs: TaskPair[];
  uploadLink: {
    id: number;
    name: string;
  } | null;
  uploads: UploadItem[];
};

function buildEmptyPair(inheritedTitle = "", inheritedText = ""): DraftPair {
  return {
    feedUploadId: null,
    storiesUploadId: null,
    title: inheritedTitle,
    text: inheritedText,
  };
}

function ensureDraftTail(pairs: DraftPair[]) {
  const hasEmptyTail = pairs.some((pair) => pair.feedUploadId === null && pair.storiesUploadId === null);
  const inheritedTitle = pairs[0]?.title?.trim() ?? "";
  const inheritedText = pairs[0]?.text?.trim() ?? "";
  return hasEmptyTail ? pairs : [...pairs, buildEmptyPair(inheritedTitle, inheritedText)];
}

function ThumbnailChip({
  upload,
  selected,
  dimmed,
  onClick,
  onHover,
}: {
  upload: UploadItem;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
  onHover: (uploadId: number | null) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(upload.id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(upload.id)}
      onBlur={() => onHover(null)}
      className={`shrink-0 rounded-xl border bg-background p-2 transition ${
        selected ? "border-primary ring-2 ring-primary/30" : "hover:border-primary/40"
      } ${dimmed ? "opacity-45" : ""}`}
    >
      {upload.thumbnailUrl ? (
        <img
          src={upload.thumbnailUrl}
          alt=""
          className="h-24 w-auto max-w-[7.5rem] rounded-md object-contain"
          loading="lazy"
        />
      ) : (
        <div className="flex h-24 w-24 items-center justify-center rounded-md bg-muted text-xs text-muted-foreground">
          Sem preview
        </div>
      )}
    </button>
  );
}

function PairSlot({
  feedUpload,
  storiesUpload,
  activeFeed,
  activeStories,
  promptFeed,
  promptStories,
  onFeedClick,
  onStoriesClick,
  onFeedClear,
  onStoriesClear,
  onHover,
}: {
  feedUpload: UploadItem | null;
  storiesUpload: UploadItem | null;
  activeFeed: boolean;
  activeStories: boolean;
  promptFeed: boolean;
  promptStories: boolean;
  onFeedClick: () => void;
  onStoriesClick: () => void;
  onFeedClear: () => void;
  onStoriesClear: () => void;
  onHover: (uploadId: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-muted/10 p-2">
      <div
        onMouseEnter={() => onHover(feedUpload?.id ?? null)}
        onMouseLeave={() => onHover(null)}
        className={`relative flex h-32 w-28 shrink-0 items-center justify-center rounded-lg bg-background p-2 transition ${
          promptFeed && !feedUpload
            ? "animate-pulse border-2 border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
            : activeFeed
              ? "bg-primary/5 ring-2 ring-primary/25"
              : "hover:bg-muted/30"
        }`}
      >
        {feedUpload && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onFeedClear();
            }}
            className="absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background/95 text-xs text-muted-foreground shadow-sm hover:text-foreground"
          >
            x
          </button>
        )}
        <button
          type="button"
          onClick={onFeedClick}
          className="flex h-full w-full items-center justify-center"
        >
        {feedUpload?.thumbnailUrl ? (
          <img
            src={feedUpload.thumbnailUrl}
            alt=""
            className="h-full w-full rounded-md object-contain"
            loading="lazy"
          />
        ) : (
          <div className="text-xs font-medium tracking-wide text-muted-foreground">FEED</div>
        )}
        </button>
      </div>

      <div
        onMouseEnter={() => onHover(storiesUpload?.id ?? null)}
        onMouseLeave={() => onHover(null)}
        className={`relative flex h-32 w-28 shrink-0 items-center justify-center rounded-lg bg-background p-2 transition ${
          promptStories && !storiesUpload
            ? "animate-pulse border-2 border-emerald-500 bg-emerald-50 ring-4 ring-emerald-100"
            : activeStories
              ? "bg-primary/5 ring-2 ring-primary/25"
              : "hover:bg-muted/30"
        }`}
      >
        {storiesUpload && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onStoriesClear();
            }}
            className="absolute top-1 right-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-background/95 text-xs text-muted-foreground shadow-sm hover:text-foreground"
          >
            x
          </button>
        )}
        <button
          type="button"
          onClick={onStoriesClick}
          className="flex h-full w-full items-center justify-center"
        >
        {storiesUpload?.thumbnailUrl ? (
          <img
            src={storiesUpload.thumbnailUrl}
            alt=""
            className="h-full w-full rounded-md object-contain"
            loading="lazy"
          />
        ) : (
          <div className="text-xs font-medium tracking-wide text-muted-foreground">STORIES</div>
        )}
        </button>
      </div>
    </div>
  );
}

export default function TaskDetailPage({ taskId }: TaskDetailProps) {
  const [, navigate] = useLocation();
  const [hoveredUploadId, setHoveredUploadId] = useState<number | null>(null);
  const [draftPairs, setDraftPairs] = useState<DraftPair[]>([buildEmptyPair()]);
  const [activePairIndex, setActivePairIndex] = useState(0);
  const [activeSlot, setActiveSlot] = useState<"feed" | "stories">("feed");
  const [centerWarning, setCenterWarning] = useState<string | null>(null);
  const [collapsedTextByPairIndex, setCollapsedTextByPairIndex] = useState<Record<number, boolean>>({});

  const taskQuery = useQuery<TaskDetail>({
    queryKey: [`/api/tasks/${taskId}`],
  });

  const savePairsMutation = useMutation({
    mutationFn: async (pairs: TaskPair[]) => {
      const response = await apiRequest("PUT", `/api/tasks/${taskId}/pairs`, { pairs });
      return response.json();
    },
    onSuccess: (result) => {
      queryClient.setQueryData<TaskDetail | undefined>([`/api/tasks/${taskId}`], (current) =>
        current
          ? {
              ...current,
              pairs: Array.isArray(result?.pairs) ? result.pairs : current.pairs,
              updatedAt: typeof result?.updatedAt === "string" ? result.updatedAt : current.updatedAt,
            }
          : current,
      );
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao salvar pares",
        description: error?.message ?? "Nao foi possivel salvar os pares.",
        variant: "destructive",
      });
    },
  });

  const detail = taskQuery.data;
  const uploadById = useMemo(
    () => new Map((detail?.uploads ?? []).map((upload) => [upload.id, upload])),
    [detail?.uploads],
  );

  useEffect(() => {
    if (!detail) {
      return;
    }

    const nextDrafts = ensureDraftTail(
      detail.pairs.map((pair) => ({
        feedUploadId: pair.feedUploadId,
        storiesUploadId: pair.storiesUploadId,
        title: pair.title ?? "",
        text: pair.text ?? "",
      })),
    );
    setDraftPairs(nextDrafts);

    const firstIncompleteIndex = nextDrafts.findIndex(
      (pair) => pair.feedUploadId === null || pair.storiesUploadId === null,
    );
    if (firstIncompleteIndex >= 0) {
      setActivePairIndex(firstIncompleteIndex);
      setActiveSlot(nextDrafts[firstIncompleteIndex].feedUploadId === null ? "feed" : "stories");
    } else {
      setActivePairIndex(Math.max(nextDrafts.length - 1, 0));
      setActiveSlot("feed");
    }
  }, [detail]);

  const selectedPair = draftPairs[activePairIndex] ?? { feedUploadId: null, storiesUploadId: null };
  const firstPair = draftPairs[0] ?? buildEmptyPair();
  const firstPairCopyReady =
    firstPair.title.trim().length > 0 && firstPair.text.trim().length > 0;
  const previewUpload =
    (hoveredUploadId ? uploadById.get(hoveredUploadId) : undefined) ??
    (activeSlot === "feed" && selectedPair.feedUploadId ? uploadById.get(selectedPair.feedUploadId) : undefined) ??
    (activeSlot === "stories" && selectedPair.storiesUploadId ? uploadById.get(selectedPair.storiesUploadId) : undefined) ??
    detail?.uploads[0];

  const usedUploadIds = useMemo(() => {
    const ids = new Set<number>();
    draftPairs.forEach((pair, pairIndex) => {
      if (pairIndex === activePairIndex) {
        return;
      }
      if (pair.feedUploadId !== null) ids.add(pair.feedUploadId);
      if (pair.storiesUploadId !== null) ids.add(pair.storiesUploadId);
    });
    return ids;
  }, [activePairIndex, draftPairs]);

  const nextEmptyPairIndex = useMemo(() => {
    const index = draftPairs.findIndex(
      (pair) => pair.feedUploadId === null || pair.storiesUploadId === null,
    );
    return index >= 0 ? index : activePairIndex;
  }, [activePairIndex, draftPairs]);

  const displayPairs = useMemo(() => {
    const entries = draftPairs.map((pair, pairIndex) => ({ pair, pairIndex }));
    const first = entries.find((entry) => entry.pairIndex === nextEmptyPairIndex);
    const rest = entries
      .filter((entry) => entry.pairIndex !== nextEmptyPairIndex)
      .sort((a, b) => b.pairIndex - a.pairIndex);
    return first ? [first, ...rest] : entries;
  }, [draftPairs, nextEmptyPairIndex]);
  const fixedPair = displayPairs[0] ?? null;
  const scrollPairs = displayPairs.slice(1);

  useEffect(() => {
    if (!centerWarning) {
      return;
    }

    const timeout = window.setTimeout(() => setCenterWarning(null), 2400);
    return () => window.clearTimeout(timeout);
  }, [centerWarning]);

  async function persistPairs(nextDraftPairs: DraftPair[]) {
    const persistedPairs: TaskPair[] = nextDraftPairs
      .filter(
        (pair) =>
          pair.feedUploadId !== null ||
          pair.storiesUploadId !== null ||
          pair.title.trim().length > 0 ||
          pair.text.trim().length > 0,
      )
      .map((pair) => ({
        feedUploadId: pair.feedUploadId,
        storiesUploadId: pair.storiesUploadId,
        title: pair.title.trim() || null,
        text: pair.text.trim() || null,
      }));
    await savePairsMutation.mutateAsync(persistedPairs);
  }

  function moveToNextSlot(nextPairs: DraftPair[], pairIndex: number) {
    const pair = nextPairs[pairIndex];
    if (pair.feedUploadId === null) {
      setActivePairIndex(pairIndex);
      setActiveSlot("feed");
      return;
    }

    if (pair.storiesUploadId === null) {
      setActivePairIndex(pairIndex);
      setActiveSlot("stories");
      return;
    }

    const ensuredPairs = ensureDraftTail(nextPairs);
    setDraftPairs(ensuredPairs);
    const nextIndex = pairIndex + 1;
    setActivePairIndex(nextIndex);
    setActiveSlot("feed");
  }

  async function handleThumbnailClick(uploadId: number) {
    if (activePairIndex > 0 && !firstPairCopyReady) {
      setCenterWarning("Preencha titulo e texto do primeiro par antes de continuar.");
      return;
    }

    const currentPair = draftPairs[activePairIndex] ?? buildEmptyPair();
    const alreadyUsedInAnotherPair =
      usedUploadIds.has(uploadId) &&
      currentPair.feedUploadId !== uploadId &&
      currentPair.storiesUploadId !== uploadId;

    if (alreadyUsedInAnotherPair) {
      return;
    }

    const nextPairs = draftPairs.map((pair) => ({ ...pair }));
    if (!nextPairs[activePairIndex]) {
      nextPairs[activePairIndex] = buildEmptyPair();
    }

    if (activeSlot === "feed") {
      const hadStories = nextPairs[activePairIndex].storiesUploadId !== null;
      nextPairs[activePairIndex].feedUploadId = uploadId;

      if (hadStories) {
        const normalized = ensureDraftTail(nextPairs);
        setDraftPairs(normalized);
        await persistPairs(normalized);
        moveToNextSlot(normalized, activePairIndex);
        return;
      }

      setDraftPairs(nextPairs);
      setActiveSlot("stories");
      return;
    }

    nextPairs[activePairIndex].storiesUploadId = uploadId;
    const firstPairTitle = nextPairs[0]?.title.trim() ?? "";
    const firstPairText = nextPairs[0]?.text.trim() ?? "";
    if (activePairIndex === 0 && (firstPairTitle.length === 0 || firstPairText.length === 0)) {
      setDraftPairs(nextPairs);
      await persistPairs(nextPairs);
      setCenterWarning("Crie um titulo e um texto para o primeiro par antes de continuar.");
      return;
    }

    const normalized = ensureDraftTail(nextPairs);
    setDraftPairs(normalized);
    await persistPairs(normalized);
    moveToNextSlot(normalized, activePairIndex);
  }

  function handleSlotClick(pairIndex: number, slot: "feed" | "stories") {
    setActivePairIndex(pairIndex);
    setActiveSlot(slot);
  }

  async function handleSlotClear(pairIndex: number, slot: "feed" | "stories") {
    const nextPairs = draftPairs.map((pair) => ({ ...pair }));
    if (!nextPairs[pairIndex]) {
      return;
    }

    if (slot === "feed") {
      nextPairs[pairIndex].feedUploadId = null;
    } else {
      nextPairs[pairIndex].storiesUploadId = null;
    }

    const normalized = ensureDraftTail(nextPairs);
    setDraftPairs(normalized);
    setActivePairIndex(pairIndex);
    setActiveSlot(slot);
    setCollapsedTextByPairIndex((current) => ({
      ...current,
      [pairIndex]: true,
    }));
    await persistPairs(normalized);
  }

  function handlePairFieldChange(pairIndex: number, field: "title" | "text", value: string) {
    setDraftPairs((current) =>
      current.map((pair, index) => {
        if (index !== pairIndex) {
          return pair;
        }
        return {
          ...pair,
          [field]: value,
        };
      }),
    );
  }

  async function handlePairFieldBlur() {
    await persistPairs(draftPairs);
  }

  function toggleTextCollapsed(pairIndex: number) {
    setCollapsedTextByPairIndex((current) => ({
      ...current,
      [pairIndex]: !(current[pairIndex] ?? true),
    }));
  }

  function isTextCollapsed(pairIndex: number) {
    return collapsedTextByPairIndex[pairIndex] ?? true;
  }

  if (!detail) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Carregando tarefa...</p>
      </div>
    );
  }

  return (
    <div className="min-h-full overflow-x-hidden bg-slate-50 p-6">
      {centerWarning && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="max-w-md rounded-2xl border border-blue-200 bg-white px-5 py-4 text-center text-sm font-medium text-slate-900 shadow-2xl">
            {centerWarning}
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1600px] space-y-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader>
            <CardTitle className="text-slate-900">Miniaturas e Pares</CardTitle>
            <CardDescription className="text-slate-600">
              Processo compacto para identificar imagens, montar pares de feed e stories e preparar a proxima etapa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 overflow-x-hidden">
            <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Preview atual
                </div>
                <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-white p-3">
                  {previewUpload?.thumbnailUrl ? (
                    <img
                      src={previewUpload.thumbnailUrl}
                      alt=""
                      className="max-h-[220px] w-full rounded-lg object-contain"
                    />
                  ) : (
                    <div className="flex h-[220px] items-center justify-center rounded-lg text-sm text-slate-500">
                      Passe o mouse sobre uma miniatura
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                  Miniaturas
                </div>
                <div className="max-h-[320px] overflow-y-auto overflow-x-hidden rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-wrap gap-3">
                    {detail.uploads.map((upload) => {
                      const selected =
                        (activeSlot === "feed" && selectedPair.feedUploadId === upload.id) ||
                        (activeSlot === "stories" && selectedPair.storiesUploadId === upload.id);
                      const dimmed = usedUploadIds.has(upload.id);

                      return (
                        <ThumbnailChip
                          key={upload.id}
                          upload={upload}
                          selected={selected}
                          dimmed={dimmed}
                          onClick={() => handleThumbnailClick(upload.id)}
                          onHover={setHoveredUploadId}
                        />
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="text-sm font-medium text-slate-900">Esteira de pares</div>
              <div className="max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-100/90 p-3">
                <div className="grid max-w-full grid-cols-[272px_minmax(0,1fr)] items-start gap-4">
                  {fixedPair && (
                    <div className="w-[272px] shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                        Par {fixedPair.pairIndex + 1}
                      </div>
                      <PairSlot
                        feedUpload={
                          fixedPair.pair.feedUploadId
                            ? uploadById.get(fixedPair.pair.feedUploadId) ?? null
                            : null
                        }
                        storiesUpload={
                          fixedPair.pair.storiesUploadId
                            ? uploadById.get(fixedPair.pair.storiesUploadId) ?? null
                            : null
                        }
                        activeFeed={activePairIndex === fixedPair.pairIndex && activeSlot === "feed"}
                        activeStories={activePairIndex === fixedPair.pairIndex && activeSlot === "stories"}
                        promptFeed={
                          activePairIndex === fixedPair.pairIndex &&
                          activeSlot === "feed" &&
                          fixedPair.pair.feedUploadId === null
                        }
                        promptStories={
                          activePairIndex === fixedPair.pairIndex &&
                          activeSlot === "stories" &&
                          fixedPair.pair.storiesUploadId === null
                        }
                        onFeedClick={() => handleSlotClick(fixedPair.pairIndex, "feed")}
                        onStoriesClick={() => handleSlotClick(fixedPair.pairIndex, "stories")}
                        onFeedClear={() => handleSlotClear(fixedPair.pairIndex, "feed")}
                        onStoriesClear={() => handleSlotClear(fixedPair.pairIndex, "stories")}
                        onHover={setHoveredUploadId}
                      />
                      <div className="mt-3 space-y-2">
                        <Input
                          value={fixedPair.pair.title}
                          onChange={(event) =>
                            handlePairFieldChange(fixedPair.pairIndex, "title", event.target.value)
                          }
                          onBlur={handlePairFieldBlur}
                          placeholder="Titulo do par"
                        />
                        <div className="space-y-2">
                          {isTextCollapsed(fixedPair.pairIndex) ? (
                            <button
                              type="button"
                              onClick={() => toggleTextCollapsed(fixedPair.pairIndex)}
                              className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-500"
                            >
                              <span className="truncate pr-3">
                                {fixedPair.pair.text.trim().length > 0
                                  ? fixedPair.pair.text.trim()
                                  : "Texto do anuncio"}
                              </span>
                              <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                            </button>
                          ) : (
                            <div className="relative">
                              <Textarea
                                value={fixedPair.pair.text}
                                onChange={(event) =>
                                  handlePairFieldChange(fixedPair.pairIndex, "text", event.target.value)
                                }
                                onBlur={handlePairFieldBlur}
                                placeholder="Texto do anuncio"
                                rows={4}
                                className="pr-10"
                              />
                              <button
                                type="button"
                                onClick={() => toggleTextCollapsed(fixedPair.pairIndex)}
                                className="absolute right-2 top-2 rounded-md p-1 text-slate-500 transition hover:bg-slate-100"
                              >
                                <ChevronDown className="h-4 w-4 rotate-180" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="min-w-0 max-w-full overflow-x-auto overflow-y-hidden pb-2">
                    <div className="flex min-w-max gap-4 pr-2">
                      {scrollPairs.map(({ pair, pairIndex }) => {
                        const feedUpload = pair.feedUploadId ? uploadById.get(pair.feedUploadId) ?? null : null;
                        const storiesUpload = pair.storiesUploadId
                          ? uploadById.get(pair.storiesUploadId) ?? null
                          : null;

                        return (
                          <div
                            key={`pair-slot-${pairIndex}`}
                            className="w-[272px] shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                          >
                            <div className="mb-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                              Par {pairIndex + 1}
                            </div>
                            <PairSlot
                              feedUpload={feedUpload}
                              storiesUpload={storiesUpload}
                              activeFeed={activePairIndex === pairIndex && activeSlot === "feed"}
                              activeStories={activePairIndex === pairIndex && activeSlot === "stories"}
                              promptFeed={
                                activePairIndex === pairIndex &&
                                activeSlot === "feed" &&
                                pair.feedUploadId === null
                              }
                              promptStories={
                                activePairIndex === pairIndex &&
                                activeSlot === "stories" &&
                                pair.storiesUploadId === null
                              }
                              onFeedClick={() => handleSlotClick(pairIndex, "feed")}
                              onStoriesClick={() => handleSlotClick(pairIndex, "stories")}
                              onFeedClear={() => handleSlotClear(pairIndex, "feed")}
                              onStoriesClear={() => handleSlotClear(pairIndex, "stories")}
                              onHover={setHoveredUploadId}
                            />
                            <div className="mt-3 space-y-2">
                              <Input
                                value={pair.title}
                                onChange={(event) =>
                                  handlePairFieldChange(pairIndex, "title", event.target.value)
                                }
                                onBlur={handlePairFieldBlur}
                                placeholder="Titulo do par"
                              />
                              <div className="space-y-2">
                                {isTextCollapsed(pairIndex) ? (
                                  <button
                                    type="button"
                                    onClick={() => toggleTextCollapsed(pairIndex)}
                                    className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs text-slate-500"
                                  >
                                    <span className="truncate pr-3">
                                      {pair.text.trim().length > 0 ? pair.text.trim() : "Texto do anuncio"}
                                    </span>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
                                  </button>
                                ) : (
                                  <div className="relative">
                                    <Textarea
                                      value={pair.text}
                                      onChange={(event) =>
                                        handlePairFieldChange(pairIndex, "text", event.target.value)
                                      }
                                      onBlur={handlePairFieldBlur}
                                      placeholder="Texto do anuncio"
                                      rows={4}
                                      className="pr-10"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => toggleTextCollapsed(pairIndex)}
                                      className="absolute right-2 top-2 rounded-md p-1 text-slate-500 transition hover:bg-slate-100"
                                    >
                                      <ChevronDown className="h-4 w-4 rotate-180" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-100/90 p-4">
              <div className="space-y-1">
                <div className="text-sm text-slate-600">
                  Finalize os pares desta tarefa antes de seguir para a distribuicao.
                </div>
                <div className="text-xs text-slate-500">
                  Ultima atualizacao {new Date(detail.updatedAt).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => navigate("/tasks")}>
                  Voltar
                </Button>
                <Button
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  onClick={() => navigate(`/tasks/${taskId}/distribution`)}
                  disabled={!((detail.completePairCount ?? 0) > 0)}
                >
                  Proxima pagina
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
