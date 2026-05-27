import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

type StorageConfig = {
  configured: boolean;
  bucketName: string | null;
  clientEmail: string | null;
  projectId: string | null;
  source: string | null;
  sourceLabel: string | null;
  filePath: string | null;
  checkedFilePaths: string[];
  reason: string | null;
  message: string | null;
};

type UploadLink = {
  id: number;
  name: string;
  publicId: string;
  pathPrefix: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
  active: boolean;
  publicUrl: string;
};

function buildDefaultExpiryLocalValue() {
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const tzOffset = nextWeek.getTimezoneOffset() * 60 * 1000;
  return new Date(nextWeek.getTime() - tzOffset).toISOString().slice(0, 16);
}

export default function StoragePage() {
  const { toast } = useToast();
  const [linkForm, setLinkForm] = useState({
    name: "",
    pathPrefix: "",
    expiresAt: buildDefaultExpiryLocalValue(),
  });

  const { data: config } = useQuery<StorageConfig>({
    queryKey: ["/api/storage/config"],
  });

  const { data: links = [] } = useQuery<UploadLink[]>({
    queryKey: ["/api/storage/upload-links"],
  });

  const createLinkMutation = useMutation({
    mutationFn: async () => {
      const expiresAt = new Date(linkForm.expiresAt);
      const response = await apiRequest("POST", "/api/storage/upload-links", {
        name: linkForm.name,
        pathPrefix: linkForm.pathPrefix,
        expiresAt: expiresAt.toISOString(),
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage/upload-links"] });
      setLinkForm({
        name: "",
        pathPrefix: "",
        expiresAt: buildDefaultExpiryLocalValue(),
      });
      toast({
        title: "Link criado",
        description: "O link publico de upload foi criado com sucesso.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao criar link",
        description: error?.message ?? "Nao foi possivel criar o link publico.",
        variant: "destructive",
      });
    },
  });

  const revokeLinkMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/storage/upload-links/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/storage/upload-links"] });
      toast({
        title: "Link excluido",
        description: "O link publico foi revogado.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Erro ao excluir link",
        description: error?.message ?? "Nao foi possivel excluir o link.",
        variant: "destructive",
      });
    },
  });

  const orderedLinks = useMemo(() => links, [links]);

  async function handleCopy(value: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: "Copiado",
        description: successMessage,
      });
    } catch (error: any) {
      toast({
        title: "Erro ao copiar",
        description: error?.message ?? "Nao foi possivel copiar.",
        variant: "destructive",
      });
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Uploads</h1>
        <p className="text-sm text-muted-foreground">
          Crie e gerencie links publicos de upload para o Google Cloud Storage.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Novo link publico</CardTitle>
          <CardDescription>
            Crie um link publico de upload com nome, pasta logica e data de expiracao.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!config?.configured && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <div className="font-medium">Storage nao configurado no servidor.</div>
              {config?.message && <div className="mt-1">{config.message}</div>}
              {config?.sourceLabel && (
                <div className="mt-1 text-xs">Origem encontrada: {config.sourceLabel}</div>
              )}
              {config?.filePath && (
                <div className="mt-1 text-xs break-all">Arquivo lido: {config.filePath}</div>
              )}
              {(config?.checkedFilePaths?.length ?? 0) > 0 && (
                <div className="mt-1 text-xs break-all">
                  Caminhos verificados: {config?.checkedFilePaths?.join(" | ")}
                </div>
              )}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="link-name">Nome</Label>
            <Input
              id="link-name"
              value={linkForm.name}
              onChange={(event) => setLinkForm({ ...linkForm, name: event.target.value })}
              placeholder="Fornecedor A"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-path-prefix">Pasta logica</Label>
            <Input
              id="link-path-prefix"
              value={linkForm.pathPrefix}
              onChange={(event) => setLinkForm({ ...linkForm, pathPrefix: event.target.value })}
              placeholder="fornecedores/fornecedor-a"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="link-expires-at">Expira em</Label>
            <Input
              id="link-expires-at"
              type="datetime-local"
              value={linkForm.expiresAt}
              onChange={(event) => setLinkForm({ ...linkForm, expiresAt: event.target.value })}
            />
          </div>
          <Button
            onClick={() => createLinkMutation.mutate()}
            disabled={createLinkMutation.isPending || !config?.configured}
          >
            {createLinkMutation.isPending ? "Criando..." : "Criar link publico"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links criados</CardTitle>
          <CardDescription>
            Copie, abra ou exclua os links publicos de upload.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {orderedLinks.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum link criado ainda.</p>
          )}

          {orderedLinks.map((link) => (
            <div key={link.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-medium">{link.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {link.active ? "Ativo" : link.revokedAt ? "Excluido" : "Expirado"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  Expira em {new Date(link.expiresAt).toLocaleString("pt-BR")}
                </div>
              </div>
              <div className="text-xs break-all text-muted-foreground">{link.publicUrl}</div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleCopy(link.publicUrl, "O link publico foi copiado.")}
                >
                  Copiar link
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(link.publicUrl, "_blank", "noopener,noreferrer")}
                >
                  Abrir
                </Button>
                {link.active && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => revokeLinkMutation.mutate(link.id)}
                    disabled={revokeLinkMutation.isPending}
                  >
                    Excluir
                  </Button>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
