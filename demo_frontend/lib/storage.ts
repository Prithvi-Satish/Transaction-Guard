"use client";

import { CaseRecord } from "./types";

const CASE_KEY = "orchestra_case_record_v1";

export const saveCaseRecord = (record: CaseRecord): void => {
  window.localStorage.setItem(CASE_KEY, JSON.stringify(record));
};

export const loadCaseRecord = (): CaseRecord | null => {
  const raw = window.localStorage.getItem(CASE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as CaseRecord;
  } catch {
    return null;
  }
};

export const clearCaseRecord = (): void => {
  window.localStorage.removeItem(CASE_KEY);
};
