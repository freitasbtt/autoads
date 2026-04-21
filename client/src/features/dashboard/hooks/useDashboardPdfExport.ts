import { useRef, useState, type RefObject } from "react";
import type { Options } from "html2canvas";

import { toast } from "@/hooks/use-toast";

type UseDashboardPdfExportOptions = {
  fileName: string;
};

type Html2CanvasModule = typeof import("html2canvas");
type JsPdfModule = typeof import("jspdf");

const EXPORT_MARGIN_MM = 10;
const EXPORT_SCALE = 2;
const EXPORT_WAIT_TIMEOUT_MS = 10000;

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}

async function waitForExportMount(
  ref: RefObject<HTMLDivElement | null>,
  timeoutMs: number,
): Promise<HTMLDivElement> {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    if (ref.current) {
      return ref.current;
    }
    await waitForAnimationFrame();
  }

  throw new Error("O container de exportacao nao foi montado a tempo.");
}

async function waitForImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));
  const pendingImages = images.filter((image) => !image.complete);

  if (pendingImages.length === 0) {
    return;
  }

  await Promise.all(
    pendingImages.map(
      (image) =>
        new Promise<void>((resolve) => {
          const done = () => resolve();
          image.addEventListener("load", done, { once: true });
          image.addEventListener("error", done, { once: true });
        }),
    ),
  );
}

async function waitForContainerReady(container: HTMLElement): Promise<void> {
  if ("fonts" in document && document.fonts?.ready) {
    try {
      await document.fonts.ready;
    } catch {
      // ignore font readiness issues
    }
  }

  await waitForImages(container);
  await waitForAnimationFrame();
  await waitForAnimationFrame();
  await new Promise((resolve) => window.setTimeout(resolve, 180));
}

function buildCanvasOptions(section: HTMLElement): Partial<Options> {
  const rect = section.getBoundingClientRect();

  return {
    backgroundColor: "#ffffff",
    imageTimeout: 15000,
    logging: false,
    scale: EXPORT_SCALE,
    useCORS: true,
    windowWidth: Math.ceil(Math.max(rect.width, document.documentElement.clientWidth)),
    windowHeight: Math.ceil(Math.max(rect.height, document.documentElement.clientHeight)),
  };
}

function appendCanvasToPdf(
  pdf: import("jspdf").jsPDF,
  canvas: HTMLCanvasElement,
  addPageBefore: boolean,
): boolean {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - EXPORT_MARGIN_MM * 2;
  const usableHeight = pageHeight - EXPORT_MARGIN_MM * 2;
  const pixelsPerPage = Math.floor((usableHeight * canvas.width) / usableWidth);

  if (pixelsPerPage <= 0) {
    return addPageBefore;
  }

  let offsetY = 0;
  let hasWrittenPage = addPageBefore;

  while (offsetY < canvas.height) {
    const sliceHeight = Math.min(pixelsPerPage, canvas.height - offsetY);
    const sliceCanvas = document.createElement("canvas");
    const context = sliceCanvas.getContext("2d");

    if (!context) {
      throw new Error("Nao foi possivel preparar o canvas do PDF.");
    }

    sliceCanvas.width = canvas.width;
    sliceCanvas.height = sliceHeight;
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
    context.drawImage(
      canvas,
      0,
      offsetY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight,
    );

    if (hasWrittenPage) {
      pdf.addPage();
    }

    const renderedHeight = (sliceHeight * usableWidth) / canvas.width;

    pdf.addImage(
      sliceCanvas.toDataURL("image/png"),
      "PNG",
      EXPORT_MARGIN_MM,
      EXPORT_MARGIN_MM,
      usableWidth,
      renderedHeight,
      undefined,
      "FAST",
    );

    hasWrittenPage = true;
    offsetY += sliceHeight;
  }

  return hasWrittenPage;
}

async function renderPdf(
  container: HTMLElement,
  fileName: string,
  html2canvasModule: Html2CanvasModule,
  jsPdfModule: JsPdfModule,
): Promise<void> {
  const html2canvas = html2canvasModule.default;
  const { jsPDF } = jsPdfModule;
  const sectionNodes = Array.from(
    container.querySelectorAll<HTMLElement>("[data-export-chunk='true']"),
  );
  const sections = sectionNodes.length > 0 ? sectionNodes : [container];
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });

  let hasRenderedAnyPage = false;

  for (const section of sections) {
    await waitForContainerReady(section);
    const canvas = await html2canvas(section, buildCanvasOptions(section));
    hasRenderedAnyPage = appendCanvasToPdf(pdf, canvas, hasRenderedAnyPage);
  }

  pdf.save(fileName);
}

export function useDashboardPdfExport({ fileName }: UseDashboardPdfExportOptions) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [shouldRenderExport, setShouldRenderExport] = useState(false);

  const exportReport = async () => {
    if (isExporting) {
      return;
    }

    setShouldRenderExport(true);
    setIsExporting(true);

    try {
      const container = await waitForExportMount(exportRef, EXPORT_WAIT_TIMEOUT_MS);
      await waitForContainerReady(container);

      const html2canvasModule = await import("html2canvas");
      const jsPdfModule = await import("jspdf");
      await renderPdf(container, fileName, html2canvasModule, jsPdfModule);

      toast({
        title: "Relatorio exportado",
        description: "O PDF do dashboard foi gerado com sucesso.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Nao foi possivel exportar o relatorio.";

      toast({
        variant: "destructive",
        title: "Falha ao exportar",
        description: message,
      });
    } finally {
      setIsExporting(false);
      setShouldRenderExport(false);
    }
  };

  return {
    exportRef,
    isExporting,
    shouldRenderExport,
    exportReport,
  };
}
