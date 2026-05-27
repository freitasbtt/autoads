import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type PublicUploadLinkInfo = {
  id: number;
  name: string;
  pathPrefix: string;
  expiresAt: string;
};

type PublicStorageUploadProps = {
  publicId: string;
};

export default function PublicStorageUpload({ publicId }: PublicStorageUploadProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [results, setResults] = useState<Array<{ name: string; status: string }>>([]);

  const {
    data: linkInfo,
    error,
    isLoading,
  } = useQuery<PublicUploadLinkInfo>({
    queryKey: [`/api/public/storage/upload-links/${publicId}`],
  });

  async function handleUpload() {
    if (!selectedFiles.length) {
      return;
    }

    setIsUploading(true);
    const nextResults: Array<{ name: string; status: string }> = [];
    const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;

    try {
      for (const file of selectedFiles) {
        const response = await fetch(
          `/api/public/storage/upload-links/${encodeURIComponent(publicId)}/files?fileName=${encodeURIComponent(
            file.name,
          )}&batchId=${encodeURIComponent(batchId)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": file.type || "application/octet-stream",
            },
            body: file,
          },
        );

        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.message || `Falha ao enviar ${file.name}`);
        }

        nextResults.push({ name: file.name, status: "Enviado com sucesso" });
      }

      setSelectedFiles([]);
      setResults(nextResults);
    } catch (uploadError: any) {
      setResults([{ name: "Erro", status: uploadError?.message ?? "Falha no upload" }]);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">Upload de Arquivos</h1>
          <p className="text-sm text-muted-foreground">
            Este link permite apenas enviar arquivos. Ele nao da acesso ao restante do sistema.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{linkInfo?.name ?? "Link publico"}</CardTitle>
            <CardDescription>
              {isLoading
                ? "Validando link..."
                : error
                ? "Nao foi possivel validar este link."
                : linkInfo
                ? `Expira em ${new Date(linkInfo.expiresAt).toLocaleString("pt-BR")}`
                : "Link carregado."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {(error as Error).message}
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium" htmlFor="public-upload-files">
                    Arquivos
                  </label>
                  <Input
                    id="public-upload-files"
                    type="file"
                    multiple
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  />
                </div>

                <Button onClick={handleUpload} disabled={isUploading || !selectedFiles.length}>
                  {isUploading ? "Enviando..." : "Enviar arquivos"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {results.map((result, index) => (
                <div key={`${result.name}-${index}`} className="rounded-md border px-3 py-2">
                  <div className="font-medium">{result.name}</div>
                  <div className="text-muted-foreground">{result.status}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
