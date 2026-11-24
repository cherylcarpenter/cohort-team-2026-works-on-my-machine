"use client";

import { useState } from "react";
import type { DemoBillOption } from "@/lib/demo/demo-bills";

export default function DemoBillPicker({ bills, disabled, onFile, onError }: {
  bills: DemoBillOption[];
  disabled?: boolean;
  onFile: (file: File) => void;
  onError: (message: string) => void;
}) {
  const [loading, setLoading] = useState<string | null>(null);

  async function choose(bill: DemoBillOption) {
    setLoading(bill.file);
    try {
      const response = await fetch(bill.href);
      if (!response.ok) throw new Error("Could not load the sample bill.");
      const blob = await response.blob();
      onFile(new File([blob], bill.file, { type: "application/pdf" }));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load the sample bill.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="w-100">
      <p className="small fw-semibold mb-2">Demo: you can use only these sample bills.</p>
      <div className="d-flex flex-column gap-2">
        {bills.map((bill) => (
          <button key={bill.file} type="button" className="btn btn-outline-secondary text-start d-flex justify-content-between"
            disabled={disabled || loading !== null} onClick={() => void choose(bill)}>
            <span>{bill.label}</span><span className="fw-semibold">{bill.amount}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
