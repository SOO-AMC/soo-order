import { cn } from "@/lib/utils";

interface SpinnerProps {
  text?: string;
  className?: string;
}

export function Spinner({ text, className }: SpinnerProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
      {text && <p className="text-sm text-muted-foreground">{text}</p>}
    </div>
  );
}
