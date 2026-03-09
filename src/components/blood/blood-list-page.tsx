"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BloodList } from "@/components/blood/blood-list";

export function BloodListPage() {
  return (
    <div className="relative p-4">
      <Tabs defaultValue="received" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 shadow-card" style={{ backgroundColor: "white" }}>
          <TabsTrigger value="received">수령</TabsTrigger>
          <TabsTrigger value="sent">출고</TabsTrigger>
        </TabsList>

        <TabsContent value="received" forceMount className="data-[state=inactive]:hidden pb-24">
          <BloodList type="received" />
        </TabsContent>

        <TabsContent value="sent" forceMount className="data-[state=inactive]:hidden pb-24">
          <BloodList type="sent" />
        </TabsContent>
      </Tabs>

    </div>
  );
}
