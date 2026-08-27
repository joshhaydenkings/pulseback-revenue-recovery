"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[PulseBack:page-error]", { name: error.name, digest: error.digest });
  }, [error]);

  return (
    <div className="route-error" role="alert">
      <AlertTriangle size={24} />
      <div>
        <h2>PulseBack could not load this server view</h2>
        <p>The database or an integration may be temporarily unavailable. No financial action was performed.</p>
        <button className="primary-button" type="button" onClick={reset}><RefreshCcw size={14} /> Try again</button>
      </div>
    </div>
  );
}
