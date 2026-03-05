import { Spinner } from "@/components/ui/spinner";

export default function MainLoading() {
  return (
    <div className="mx-auto max-w-md md:max-w-2xl lg:max-w-full flex items-center justify-center py-24">
      <Spinner text="불러오는 중..." />
    </div>
  );
}
