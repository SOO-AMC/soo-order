import type { Metadata } from "next";
import { SearchList } from "@/components/search/search-list";

export const metadata: Metadata = {
  title: "조회",
};

export default function SearchPage() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full">
      <SearchList />
    </div>
  );
}
