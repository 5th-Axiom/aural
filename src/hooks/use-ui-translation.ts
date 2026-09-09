"use client";
import { useAppLocale } from "@/components/app-locale-provider";
/** Literal UI copy lives in the central catalog; candidate/model content is never translated here. */
export function useUiTranslation() {
  return useAppLocale().t;
}
