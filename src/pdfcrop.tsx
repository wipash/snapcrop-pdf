import React, { useState, useEffect, useRef, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument } from "pdf-lib";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

// Set the worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

const PDFCropInterface: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [leftCrop, setLeftCrop] = useState(0);
  const [rightCrop, setRightCrop] = useState(0);
  const [topCrop, setTopCrop] = useState(0);
  const [bottomCrop, setBottomCrop] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const renderPage = useCallback(
    async (pageNum: number) => {
      if (!pdfDocument || !canvasRef.current) return;

      try {
        const page = await pdfDocument.getPage(pageNum);
        const scale = 1.5;
        const viewport = page.getViewport({ scale });

        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        const renderContext = {
          canvasContext: context,
          viewport: viewport,
        };

        await page.render(renderContext).promise;
      } catch (error) {
        console.error(`Error rendering page ${pageNum}:`, error);
        setError(`Failed to render page ${pageNum}. Please try again.`);
      }
    },
    [pdfDocument]
  );

  useEffect(() => {
    if (pdfDocument) {
      renderPage(currentPage);
    }
  }, [currentPage, pdfDocument, renderPage]);

  const handleFileUpload = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setIsLoading(true);
      setError(null);
      setFile(file);
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDocument(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
      } catch (error) {
        console.error("Error loading PDF:", error);
        setError(
          "Failed to load PDF. The file might be corrupted or password-protected."
        );
      } finally {
        setIsLoading(false);
      }
    } else {
      setError("Please upload a valid PDF file.");
    }
  };

  const renderPageToImage = async (
    page: pdfjsLib.PDFPageProxy,
    scale: number = 4
  ): Promise<string> => {
    const viewport = page.getViewport({ scale });
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas not available");

    const context = canvas.getContext("2d");
    if (!context) throw new Error("Unable to get canvas context");

    canvas.height = viewport.height;
    canvas.width = viewport.width;

    await page.render({ canvasContext: context, viewport }).promise;

    return canvas.toDataURL("image/png", 1.0);
  };

  const cropImage = (
    imageData: string,
    crop: { left: number; right: number; top: number; bottom: number }
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Unable to get canvas context");

        const cropWidth = img.width * (1 - crop.left / 100 - crop.right / 100);
        const cropHeight =
          img.height * (1 - crop.top / 100 - crop.bottom / 100);

        canvas.width = cropWidth;
        canvas.height = cropHeight;

        ctx.drawImage(
          img,
          img.width * (crop.left / 100),
          img.height * (crop.top / 100),
          cropWidth,
          cropHeight,
          0,
          0,
          cropWidth,
          cropHeight
        );

        resolve(canvas.toDataURL("image/png", 1.0));
      };
      img.src = imageData;
    });
  };

  const handleCropPDFBased = async (
    arrayBuffer: ArrayBuffer
  ): Promise<Uint8Array> => {
    const pdfDoc = await PDFDocument.load(arrayBuffer, {
      ignoreEncryption: true,
    });
    const newPdfDoc = await PDFDocument.create();

    const pageCount = pdfDoc.getPageCount();

    for (let i = 0; i < pageCount; i++) {
      setProcessingStatus(
        `Processing page ${i + 1} of ${pageCount} (PDF-based method)...`
      );

      const [embeddedPage] = await newPdfDoc.embedPages([pdfDoc.getPage(i)]);
      const { width, height } = embeddedPage.scale(1);

      const leftCropPoint = (leftCrop / 100) * width;
      const rightCropPoint = ((100 - rightCrop) / 100) * width;
      const topCropPoint = (topCrop / 100) * height;
      const bottomCropPoint = ((100 - bottomCrop) / 100) * height;

      const newWidth = rightCropPoint - leftCropPoint;
      const newHeight = bottomCropPoint - topCropPoint;

      const newPage = newPdfDoc.addPage([newWidth, newHeight]);

      newPage.drawPage(embeddedPage, {
        x: -leftCropPoint,
        y: newHeight - height + topCropPoint,
        width: width,
        height: height,
      });
    }

    return newPdfDoc.save();
  };

  const handleCropImageBased = async (
    arrayBuffer: ArrayBuffer
  ): Promise<Uint8Array> => {
    const pdfDocument = await pdfjsLib.getDocument({ data: arrayBuffer })
      .promise;
    const newPdfDoc = await PDFDocument.create();

    const pageCount = pdfDocument.numPages;

    for (let i = 1; i <= pageCount; i++) {
      setProcessingStatus(
        `Processing page ${i} of ${pageCount} (Image-based method)...`
      );

      const page = await pdfDocument.getPage(i);
      const imageData = await renderPageToImage(page);

      const croppedImageData = await cropImage(imageData, {
        left: leftCrop,
        right: rightCrop,
        top: topCrop,
        bottom: bottomCrop,
      });

      const pngImage = await newPdfDoc.embedPng(croppedImageData);
      const { width, height } = pngImage.scale(1);

      const newPage = newPdfDoc.addPage([width, height]);
      newPage.drawImage(pngImage, {
        x: 0,
        y: 0,
        width: width,
        height: height,
      });
    }

    return newPdfDoc.save();
  };

  const changePage = (delta: number) => {
    setCurrentPage((prev) => {
      const newPage = prev + delta;
      return newPage > 0 && newPage <= totalPages ? newPage : prev;
    });
  };

  const handleCrop = async () => {
    if (!file) return;

    setProcessingStatus("Preparing to crop PDF...");
    setError(null);

    try {
      const arrayBuffer = await file.arrayBuffer();

      let pdfBytes: Uint8Array;

      try {
        // First, try the PDF-based method
        pdfBytes = await handleCropPDFBased(arrayBuffer);
      } catch (pdfError) {
        console.error("PDF-based method failed:", pdfError);
        setProcessingStatus(
          "PDF-based method failed. Falling back to image-based method..."
        );

        // If PDF-based method fails, fall back to image-based method
        pdfBytes = await handleCropImageBased(arrayBuffer);
      }

      setProcessingStatus("Finalizing document...");
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "cropped_document.pdf";
      link.click();

      setProcessingStatus("Cropping complete. Document saved.");
    } catch (error) {
      console.error("Error cropping PDF:", error);
      setError(
        `Failed to crop PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setProcessingStatus("");
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📄✂️ SnapCrop PDF</h1>

      <div className="mb-4">
        <label htmlFor="pdf-upload" className="cursor-pointer">
          <div className="flex items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="text-center">
              <Upload className="mx-auto h-12 w-12 text-gray-400" />
              <p className="mt-1 text-sm text-gray-600">
                {file ? file.name : "Click to upload or drag and drop"}
              </p>
            </div>
          </div>
          <input
            id="pdf-upload"
            type="file"
            className="hidden"
            onChange={handleFileUpload}
            accept=".pdf"
          />
        </label>
      </div>

      {isLoading && <p className="text-center">Loading PDF...</p>}
      {error && <p className="text-red-500 text-center">{error}</p>}

      {pdfDocument && !isLoading && (
        <>
          <div className="mb-4">
            <p className="font-bold mb-2">Horizontal Crop</p>
            <Slider
              min={0}
              max={100}
              step={0.1}
              value={[leftCrop, 100 - rightCrop]}
              onValueChange={([left, right]) => {
                setLeftCrop(left);
                setRightCrop(100 - right);
              }}
            />
          </div>

          <div className="flex justify-between mb-4">
            <span>Left: {leftCrop}%</span>
            <span>Right: {rightCrop}%</span>
          </div>

          <div className="mb-4">
            <p className="font-bold mb-2">Vertical Crop</p>
            <Slider
              min={0}
              max={100}
              step={0.1}
              value={[topCrop, 100 - bottomCrop]}
              onValueChange={([top, bottom]) => {
                setTopCrop(top);
                setBottomCrop(100 - bottom);
              }}
            />
          </div>

          <div className="flex justify-between mb-4">
            <span>Top: {topCrop}%</span>
            <span>Bottom: {bottomCrop}%</span>
          </div>

          <div className="flex justify-between items-center mb-4">
            <Button onClick={() => changePage(-1)} disabled={currentPage === 1}>
              Previous
            </Button>
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Button
              onClick={() => changePage(1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>

          <div className="bg-gray-200 mb-4 relative">
            <canvas ref={canvasRef} className="max-w-full h-auto" />
            <div
              className="absolute top-0 left-0 right-0 bg-black bg-opacity-50"
              style={{ height: `${topCrop}%` }}
            />
            <div
              className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50"
              style={{ height: `${bottomCrop}%` }}
            />
            <div
              className="absolute top-0 bottom-0 left-0 bg-black bg-opacity-50"
              style={{ width: `${leftCrop}%` }}
            />
            <div
              className="absolute top-0 bottom-0 right-0 bg-black bg-opacity-50"
              style={{ width: `${rightCrop}%` }}
            />
          </div>

          <Button onClick={handleCrop} className="w-full">
            Crop and Download PDF
          </Button>
        </>
      )}
    </div>
  );
};

export default PDFCropInterface;
