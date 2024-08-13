import React, { useState, useEffect, useRef, useCallback } from "react";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import * as pdfjsLib from "pdfjs-dist";
import { PDFDocument, rgb } from "pdf-lib";
import { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

// Set the worker source for pdf.js
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.mjs`;

const PDFTextRemovalInterface: React.FC = () => {
  const [file, setFile] = useState<File | null>(null);
  const [leftMargin, setLeftMargin] = useState(50);
  const [rightMargin, setRightMargin] = useState(50);
  const [topMargin, setTopMargin] = useState(50);
  const [bottomMargin, setBottomMargin] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageRange, setPageRange] = useState<[number, number]>([1, 1]);
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
    if (
      pdfDocument &&
      currentPage >= pageRange[0] &&
      currentPage <= pageRange[1]
    ) {
      renderPage(currentPage);
    } else if (currentPage < pageRange[0]) {
      setCurrentPage(pageRange[0]);
    } else if (currentPage > pageRange[1]) {
      setCurrentPage(pageRange[1]);
    }
  }, [currentPage, pdfDocument, renderPage, pageRange]);

  const changePage = (delta: number) => {
    setCurrentPage((prev) => {
      const newPage = prev + delta;
      return newPage >= pageRange[0] && newPage <= pageRange[1]
        ? newPage
        : prev;
    });
  };

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
        setPageRange([1, pdf.numPages]);
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


  const handleRemoveText = async () => {
    if (!file) return;

    setProcessingStatus("Preparing to remove text from PDF...");
    setError(null);
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);

      for (let i = pageRange[0] - 1; i < pageRange[1]; i++) {
        setProcessingStatus(`Processing page ${i + 1} of ${pageRange[1]}...`);
        const page = pdfDoc.getPage(i);
        const { width, height } = page.getSize();

        // Define the rectangles for text removal
        const topRect = { x: 0, y: height - topMargin, width: width, height: topMargin };
        const bottomRect = { x: 0, y: 0, width: width, height: bottomMargin };
        const leftRect = { x: 0, y: 0, width: leftMargin, height: height };
        const rightRect = { x: width - rightMargin, y: 0, width: rightMargin, height: height };

        // Remove text from these areas
        for (const rect of [topRect, bottomRect, leftRect, rightRect]) {
          page.drawRectangle({
            ...rect,
            color: rgb(1,1,1), // White color
            opacity: 1,
          });
        }
      }

      setProcessingStatus("Finalizing document...");
      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes], { type: "application/pdf" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = "text_removed_document.pdf";
      link.click();

      setProcessingStatus("Text removal complete. Document saved.");
    } catch (error) {
      console.error("Error removing text from PDF:", error);
      setError(
        `Failed to remove text from PDF: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      setProcessingStatus("");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📄🧹 Text Removal Mode</h1>

      {/* File upload section */}
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
          {/* Page Range slider (reuse from PDFCropInterface) */}
          <div className="mb-4">
            <p className="font-bold mb-2">Page Range</p>
            <Slider
              min={1}
              max={totalPages}
              step={1}
              value={pageRange}
              onValueChange={(value) => setPageRange(value as [number, number])}
            />
            <div className="flex justify-between mt-2">
              <span>Start: Page {pageRange[0]}</span>
              <span>End: Page {pageRange[1]}</span>
            </div>
          </div>

          <div className="mb-4">
            <p className="font-bold mb-2">Left Margin</p>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[leftMargin]}
              onValueChange={([value]) => setLeftMargin(value)}
            />
            <span>Left Margin: {leftMargin}px</span>
          </div>

          <div className="mb-4">
            <p className="font-bold mb-2">Right Margin</p>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[rightMargin]}
              onValueChange={([value]) => setRightMargin(value)}
            />
            <span>Right Margin: {rightMargin}px</span>
          </div>

          <div className="mb-4">
            <p className="font-bold mb-2">Top Margin</p>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[topMargin]}
              onValueChange={([value]) => setTopMargin(value)}
            />
            <span>Top Margin: {topMargin}px</span>
          </div>

          <div className="mb-4">
            <p className="font-bold mb-2">Bottom Margin</p>
            <Slider
              min={0}
              max={100}
              step={1}
              value={[bottomMargin]}
              onValueChange={([value]) => setBottomMargin(value)}
            />
            <span>Bottom Margin: {bottomMargin}px</span>
          </div>

          {/* Page navigation buttons (reuse from PDFCropInterface) */}
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

          {/* Canvas for PDF preview (reuse from PDFCropInterface) */}
          {currentPage >= pageRange[0] && currentPage <= pageRange[1] ? (
            <div className="bg-gray-200 mb-4 relative">
              <canvas ref={canvasRef} className="max-w-full h-auto" />
              <div
                className="absolute top-0 left-0 right-0 bg-black bg-opacity-50"
                style={{ height: `${topMargin}%` }}
              />
              <div
                className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50"
                style={{ height: `${bottomMargin}%` }}
              />
              <div
                className="absolute top-0 bottom-0 left-0 bg-black bg-opacity-50"
                style={{ width: `${leftMargin}%` }}
              />
              <div
                className="absolute top-0 bottom-0 right-0 bg-black bg-opacity-50"
                style={{ width: `${rightMargin}%` }}
              />
            </div>
          ) : (
            <div className="bg-gray-200 mb-4 p-4 text-center">
              This page is not in the selected range.
            </div>
          )}

          <Button
            onClick={handleRemoveText}
            className="w-full"
            disabled={isProcessing}
          >
            {isProcessing ? "Processing..." : "Remove Text and Download PDF"}
          </Button>

          {processingStatus && (
            <div className="mt-4 p-2 bg-blue-100 text-blue-700 rounded">
              {processingStatus}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default PDFTextRemovalInterface;