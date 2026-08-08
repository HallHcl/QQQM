import { AlertTriangle } from "lucide-react";
import { ApiError } from "@/api/errors";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ErrorStateProps {
  /** The caught error, if available — used to derive a sensible default title/message. */
  error?: unknown;
  title?: string;
  message?: string;
  onRetry?: () => void;
  className?: string;
}

const STATUS_TITLES: Record<number, string> = {
  403: "Not permitted",
  404: "Not found",
  409: "Out of date",
};

export function ErrorState({ error, title, message, onRetry, className }: ErrorStateProps) {
  const apiError = error instanceof ApiError ? error : undefined;
  const resolvedTitle = title ?? (apiError && STATUS_TITLES[apiError.status]) ?? "Something went wrong";
  const resolvedMessage = message ?? apiError?.message ?? "An unexpected error occurred.";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-2 rounded-md border border-border py-16 text-center",
        className
      )}
    >
      <AlertTriangle className="h-6 w-6 text-danger" />
      <p className="text-sm font-medium text-foreground">{resolvedTitle}</p>
      <p className="text-sm text-muted-foreground">{resolvedMessage}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
