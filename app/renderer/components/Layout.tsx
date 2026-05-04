import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/renderer/components/ui/tabs";
import { Film } from "lucide-react";
import ImageToReels from "@/renderer/pages/ImageToReels";

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-background text-foreground overflow-hidden">
      {/* Header */}
      <header className="flex h-14 shrink-0 items-center border-b border-border px-6">
        <div className="flex items-center gap-2">
          <Film className="h-5 w-5 text-primary" />
          <span className="text-base font-semibold tracking-tight">NextConvert</span>
        </div>
      </header>

      {/* Main content */}
      <main className="flex flex-1 flex-col overflow-hidden px-6 pt-5 pb-6">
        <Tabs defaultValue="image-to-reels" className="flex flex-1 flex-col overflow-hidden">
          <TabsList className="w-fit">
            <TabsTrigger value="image-to-reels">Image to Reels</TabsTrigger>
          </TabsList>

          <TabsContent
            value="image-to-reels"
            className="flex flex-1 flex-col overflow-hidden mt-4"
          >
            <ImageToReels />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
