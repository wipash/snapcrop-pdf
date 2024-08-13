import './App.css'
import PDFCropInterface from './pdfcrop.tsx'
import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import PDFTextRemovalInterface from "./pdfremove.tsx";


function App() {

  const [activeTab, setActiveTab] = useState("crop");

  return (
    <div className="p-4 max-w-xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">📄✂️ PDF Processing Tool</h1>
      
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="crop">Crop PDF</TabsTrigger>
          <TabsTrigger value="remove-text">Remove Text</TabsTrigger>
        </TabsList>
        <TabsContent value="crop">
          <PDFCropInterface />
        </TabsContent>
        <TabsContent value="remove-text">
          <PDFTextRemovalInterface />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default App
