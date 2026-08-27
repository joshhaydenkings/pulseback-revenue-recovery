"use client";

import { Download } from "lucide-react";

export function ExportButton({
  data,
  filename,
  label = "Export JSON",
}: {
  data: unknown;
  filename: string;
  label?: string;
}) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button className="secondary-button" type="button" onClick={download}>
      <Download size={14} />
      {label}
    </button>
  );
}
