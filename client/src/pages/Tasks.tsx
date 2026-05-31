import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowUpRight, Clock3, Layers3, Trash2, UserRound } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type TaskListItem = {
  id: number;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  clientName: string;
  responsibleName: string | null;
  pairCount: number;
  destinationCount: number;
  uploadCount: number;
  coverThumbnailUrl: string | null;
  configurationElapsedSeconds?: number;
  automationElapsedSeconds?: number;
  totalElapsedSeconds?: number;
};

type KanbanColumnKey = "received" | "configuring" | "in_progress" | "completed";

type KanbanColumn = {
  key: KanbanColumnKey;
  title: string;
  description: string;
};

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    key: "received",
    title: "Recebidas",
    description: "Entradas novas aguardando triagem.",
  },
  {
    key: "configuring",
    title: "Configurando",
    description: "Pares em revisão e montagem.",
  },
  {
    key: "in_progress",
    title: "Em andamento",
    description: "Distribuição pronta e fluxo em processamento.",
  },
  {
    key: "completed",
    title: "Concluídas",
    description: "Tarefas já finalizadas.",
  },
];

function formatTaskDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeTaskLabel(task: TaskListItem) {
  return task.title.trim().length > 0 ? task.title : `Tarefa #${task.id}`;
}

function resolveKanbanColumn(task: TaskListItem): KanbanColumnKey {
  const normalizedStatus = task.status.trim().toLowerCase();

  if (normalizedStatus === "completed" || normalizedStatus === "success") {
    return "completed";
  }

  if (normalizedStatus === "publishing") {
    return "in_progress";
  }

  if (task.destinationCount > 0) {
    return "in_progress";
  }

  if (task.pairCount > 0) {
    return "configuring";
  }

  return "received";
}

function statusLabel(task: TaskListItem, columnKey: KanbanColumnKey) {
  const normalizedStatus = task.status.trim().toLowerCase();
  if (normalizedStatus === "publishing") return "Publicando";
  if (normalizedStatus === "error" || normalizedStatus === "failed") return "Erro";
  if (columnKey === "received") return "Recebida";
  if (columnKey === "configuring") return "Configurando";
  if (columnKey === "in_progress") {
    if (normalizedStatus === "pending") return "Em andamento";
    if (normalizedStatus === "active") return "Ativa";
    return "Em andamento";
  }
  if (normalizedStatus === "completed") return "Concluida";
  return "Concluida";
}

function statusBadgeClass(task: TaskListItem) {
  const normalizedStatus = task.status.trim().toLowerCase();
  if (normalizedStatus === "publishing") {
    return "border-blue-200 bg-blue-50 text-blue-700";
  }
  if (normalizedStatus === "completed" || normalizedStatus === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-700";
  }
  if (normalizedStatus === "error" || normalizedStatus === "failed") {
    return "border-rose-200 bg-rose-50 text-rose-700";
  }
  return "border-slate-200 bg-slate-50 text-slate-700";
}

function formatElapsedTime(totalSeconds: number | null | undefined) {
  const seconds = Math.max(0, Math.floor(totalSeconds ?? 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  if (hours > 0) {
    return `${hours}h ${String(minutes).padStart(2, "0")}m`;
  }
  return `${minutes}m ${String(remainingSeconds).padStart(2, "0")}s`;
}

function TaskKanbanCard({
  task,
  onOpen,
  onRequestDelete,
  isDeleting,
}: {
  task: TaskListItem;
  onOpen: (taskId: number) => void;
  onRequestDelete: (task: TaskListItem) => void;
  isDeleting: boolean;
}) {
  const columnKey = resolveKanbanColumn(task);

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md">
      <div className="flex items-start gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
          {task.coverThumbnailUrl ? (
            <img
              src={task.coverThumbnailUrl}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Layers3 className="h-5 w-5 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-slate-900">{task.clientName}</div>
          <div className="mt-1 line-clamp-2 text-sm text-slate-700">{normalizeTaskLabel(task)}</div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge variant="outline" className={cn("shrink-0", statusBadgeClass(task))}>
            {statusLabel(task, columnKey)}
          </Badge>
          <button
            type="button"
            title="Remover tarefa"
            aria-label={`Remover ${normalizeTaskLabel(task)}`}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:pointer-events-none disabled:opacity-50"
            disabled={isDeleting}
            onClick={(event) => {
              event.stopPropagation();
              onRequestDelete(task);
            }}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Tarefa</div>
          <div className="mt-1 font-medium text-slate-800">#{task.id}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">Pares</div>
          <div className="mt-1 font-medium text-slate-800">{task.pairCount}</div>
        </div>
      </div>

      <div className="mt-3 space-y-2 text-xs text-slate-600">
        <div className="flex items-center gap-2">
          <UserRound className="h-3.5 w-3.5 text-slate-400" />
          <span>{task.responsibleName ?? "Nao definido"}</span>
        </div>
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          <span>{formatElapsedTime(task.totalElapsedSeconds)}</span>
        </div>
        <div className="text-[11px] text-slate-400">Criada em {formatTaskDate(task.createdAt)}</div>
      </div>

      <Button
        type="button"
        onClick={() => onOpen(task.id)}
        className="mt-3 h-9 w-full justify-between rounded-xl bg-blue-600 text-white hover:bg-blue-700"
      >
        Abrir tarefa
        <ArrowUpRight className="h-4 w-4" />
      </Button>
    </article>
  );
}

export default function TasksPage() {
  const [, navigate] = useLocation();
  const [taskPendingDelete, setTaskPendingDelete] = useState<TaskListItem | null>(null);
  const { data: tasks = [] } = useQuery<TaskListItem[]>({
    queryKey: ["/api/tasks"],
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const response = await apiRequest("DELETE", `/api/tasks/${taskId}`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setTaskPendingDelete(null);
      toast({
        title: "Tarefa removida",
        description: "A tarefa saiu do Kanban.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Falha ao remover tarefa",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const tasksByColumn = useMemo(() => {
    const grouped: Record<KanbanColumnKey, TaskListItem[]> = {
      received: [],
      configuring: [],
      in_progress: [],
      completed: [],
    };

    tasks.forEach((task) => {
      grouped[resolveKanbanColumn(task)].push(task);
    });

    return grouped;
  }, [tasks]);

  return (
    <div className="min-h-full bg-slate-50 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <Card className="border-slate-200 bg-white shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-3xl font-semibold tracking-tight text-slate-900">
              Tarefas
            </CardTitle>
            <CardDescription className="text-sm text-slate-600">
              Gerencie o fluxo das tarefas por etapa antes de abrir cada item para revisar pares e distribuição.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 xl:grid-cols-4">
              {KANBAN_COLUMNS.map((column) => {
                const columnTasks = tasksByColumn[column.key];
                return (
                  <section
                    key={column.key}
                    className={cn(
                      "rounded-3xl border border-slate-200 bg-slate-100/90 p-4",
                      "flex min-h-[540px] flex-col",
                    )}
                  >
                    <div className="mb-4">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-base font-semibold text-slate-900">{column.title}</h2>
                        <Badge variant="outline" className="border-slate-300 bg-white text-slate-700">
                          {columnTasks.length}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-slate-600">{column.description}</p>
                    </div>

                    <div className="flex-1 space-y-3">
                      {columnTasks.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-4 py-8 text-center text-sm text-slate-500">
                          Nenhuma tarefa nesta etapa.
                        </div>
                      ) : (
                        columnTasks.map((task) => (
                          <TaskKanbanCard
                            key={task.id}
                            task={task}
                            onOpen={(taskId) => navigate(`/tasks/${taskId}`)}
                            onRequestDelete={setTaskPendingDelete}
                            isDeleting={deleteTaskMutation.isPending && taskPendingDelete?.id === task.id}
                          />
                        ))
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      <AlertDialog
        open={Boolean(taskPendingDelete)}
        onOpenChange={(open) => {
          if (!open && !deleteTaskMutation.isPending) {
            setTaskPendingDelete(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover tarefa?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acao remove a tarefa {taskPendingDelete ? `#${taskPendingDelete.id}` : ""} do Kanban. Os arquivos enviados permanecem preservados no armazenamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTaskMutation.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={deleteTaskMutation.isPending || !taskPendingDelete}
              onClick={(event) => {
                event.preventDefault();
                if (taskPendingDelete) {
                  deleteTaskMutation.mutate(taskPendingDelete.id);
                }
              }}
            >
              {deleteTaskMutation.isPending ? "Removendo..." : "Remover tarefa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
