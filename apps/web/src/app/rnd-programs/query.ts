import type {
  RndProgramListResult,
  RndProgramSummaryResult,
  RndQueryPort
} from "@youone/feature-rnd/public";

import { previewRndPrograms } from "../../composition/preview-data";
import { previewDataEnabled } from "../../composition/preview-mode";

class UnavailableRndQuery implements RndQueryPort {
  async listInternalSummaries(): Promise<RndProgramListResult> {
    return { availability: "UNAVAILABLE", items: [], reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getInternalSummary(rndProgramId: string): Promise<RndProgramSummaryResult> {
    void rndProgramId;
    return { availability: "UNAVAILABLE", summary: null, reason: "QUERY_ADAPTER_NOT_CONFIGURED" };
  }

  async getVendorSummary(): Promise<{ readonly availability: "FORBIDDEN"; readonly summary: null }> {
    return { availability: "FORBIDDEN", summary: null };
  }
}

class PreviewRndQuery implements RndQueryPort {
  async listInternalSummaries(): Promise<RndProgramListResult> {
    return { availability: "AVAILABLE", items: previewRndPrograms };
  }

  async getInternalSummary(rndProgramId: string): Promise<RndProgramSummaryResult> {
    const summary = previewRndPrograms.find((program) => program.rndProgramId === rndProgramId);
    return summary ? { availability: "AVAILABLE", summary } : { availability: "NOT_FOUND", summary: null };
  }

  async getVendorSummary(): Promise<{ readonly availability: "FORBIDDEN"; readonly summary: null }> {
    return { availability: "FORBIDDEN", summary: null };
  }
}

export function rndQuery(usePreviewData = previewDataEnabled()): RndQueryPort {
  return usePreviewData ? new PreviewRndQuery() : new UnavailableRndQuery();
}
