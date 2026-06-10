import type { FaqItem } from "../../db/types";

type GoogleSheetsResponse = {
  values: string[][];
};

/**
 * Loads FAQ data from a Google Sheet.
 *
 * Column mapping:
 *   A (index 0) = Code
 *   B (index 1) = Category
 *   C (index 2) = No.
 *   D (index 3) = Question (used)
 *   E (index 4) = Answer (used)
 *
 * Row 0 is treated as the header and skipped.
 * Rows where column D or E is empty are also skipped.
 *
 * @returns Array of FAQ items ready for upsert (without id/createdAt/updatedAt)
 */
export async function loadFaqFromSheet(): Promise<Omit<FaqItem, "id" | "createdAt" | "updatedAt">[]> {
  const apiKey = process.env.GOOGLE_SHEETS_API_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const range = process.env.GOOGLE_SHEET_RANGE ?? "Tab!A:E";

  if (!apiKey || !sheetId) {
    throw new Error("GOOGLE_SHEETS_API_KEY and GOOGLE_SHEET_ID environment variables are required");
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?key=${apiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Google Sheets API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as GoogleSheetsResponse;
  const rows = data.values ?? [];

  const results: Omit<FaqItem, "id" | "createdAt" | "updatedAt">[] = [];

  // i starts at 1 to skip header row (row 0)
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const question = values?.[3]?.trim();
    const answer = values?.[4]?.trim();

    if (!question || !answer) {
      continue;
    }

    const category = values?.[1]?.trim() || null;

    results.push({
      question,
      answer,
      category,
      sourceRow: i, // 1-based row index after skipping header
    });
  }

  return results;
}
