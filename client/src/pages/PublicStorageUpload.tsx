import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, UploadCloud } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
  const [fileInputKey, setFileInputKey] = useState(0);
  const [uploadFeedback, setUploadFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

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
    setUploadFeedback(null);
    const batchId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    let uploadedCount = 0;

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

        uploadedCount += 1;
      }

      setSelectedFiles([]);
      setFileInputKey((current) => current + 1);
      setUploadFeedback({
        type: "success",
        message:
          uploadedCount === 1
            ? "Upload concluido com sucesso."
            : `${uploadedCount} arquivos enviados com sucesso.`,
      });
    } catch (uploadError: any) {
      setUploadFeedback({
        type: "error",
        message:
          uploadedCount > 0
            ? `${uploadedCount} arquivo(s) foram enviados antes do erro. ${
                uploadError?.message ?? "Falha no upload."
              }`
            : uploadError?.message ?? "Falha no upload.",
      });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex justify-center">
          <img src="/logo_orygo_vetor.svg" alt="Orygo" className="h-10 w-auto object-contain" />
        </div>

        <Card className="overflow-hidden border-slate-200 bg-white shadow-sm">
          <CardHeader className="border-b border-slate-200 bg-slate-100/90">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-blue-600">
                <UploadCloud className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-2xl font-semibold tracking-tight text-slate-900">
                  Upload de arquivos
                </CardTitle>
                <CardDescription className="mt-1 text-sm text-slate-600">
                  Este link permite apenas enviar arquivos. Ele nao da acesso ao restante do sistema.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-5 p-5">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-sm font-semibold text-slate-900">{linkInfo?.name ?? "Link publico"}</div>
              <div className="mt-1 text-xs text-slate-500">
                {isLoading
                  ? "Validando link..."
                  : error
                    ? "Nao foi possivel validar este link."
                    : linkInfo
                      ? `Expira em ${new Date(linkInfo.expiresAt).toLocaleString("pt-BR")}`
                      : "Link carregado."}
              </div>
            </div>

            {error ? (
              <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{(error as Error).message}</span>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900" htmlFor="public-upload-files">
                    Arquivos
                  </label>
                  <Input
                    key={fileInputKey}
                    id="public-upload-files"
                    type="file"
                    multiple
                    disabled={isUploading || isLoading || !linkInfo}
                    className="border-slate-200 bg-white"
                    onChange={(event) => setSelectedFiles(Array.from(event.target.files ?? []))}
                  />
                  <div className="text-xs text-slate-500">
                    {selectedFiles.length > 0
                      ? `${selectedFiles.length} arquivo(s) selecionado(s).`
                      : "Selecione um ou mais arquivos para enviar."}
                  </div>
                </div>

                {uploadFeedback && (
                  <div
                    className={cn(
                      "flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm",
                      uploadFeedback.type === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-700",
                    )}
                  >
                    {uploadFeedback.type === "success" ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    ) : (
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    )}
                    <span>{uploadFeedback.message}</span>
                  </div>
                )}

                <Button
                  onClick={handleUpload}
                  disabled={isUploading || !selectedFiles.length || isLoading || !linkInfo}
                  className="h-11 w-full rounded-xl bg-blue-600 text-white hover:bg-blue-700"
                >
                  {isUploading ? "Enviando arquivos, aguarde" : "Enviar arquivos"}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
