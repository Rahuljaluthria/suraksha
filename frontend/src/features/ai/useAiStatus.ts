import { useEffect, useState } from "react";
import { aiService } from "@/services/ai.service";
import type { AiStatus } from "@/types/ai";

/**
 * Whether AI is available on this deployment and which AI features the signed-in user may use.
 * Returns null while loading or when the status cannot be fetched, so callers simply show
 * nothing and the rest of the page keeps working.
 */
export function useAiStatus(): AiStatus | null {
  const [status, setStatus] = useState<AiStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    aiService
      .getStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (!cancelled) setStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}
