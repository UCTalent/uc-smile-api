import type { FaqItem } from "../../db/types";

/**
 * Loads FAQ data from a publicly shared Google Sheet via CSV export.
 *
 * No API key required — uses the public CSV export endpoint which works
 * for any sheet that has "Anyone with the link can view" sharing.
 *
 * Column mapping (matches the UC Smile FAQ sheet):
 *   A (index 0) = Mã Phân Loại (Code)
 *   B (index 1) = Tên Phân hệ (Category)
 *   C (index 2) = No.
 *   D (index 3) = Câu Hỏi (Question) ← used
 *   E (index 4) = Nội Dung Đào Tạo (Answer) ← used
 *
 * Row 0 is the header and is skipped.
 * Rows where column D or E is empty are also skipped.
 */
export async function loadFaqFromSheet(): Promise<Omit<FaqItem, "id" | "createdAt" | "updatedAt">[]> {
  const sheetId = process.env.GOOGLE_SHEET_ID;
  const gid = process.env.GOOGLE_SHEET_GID ?? "0";

  if (!sheetId) {
    throw new Error("GOOGLE_SHEET_ID environment variable is required");
  }

  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10_000);

  let response: Response;
  try {
    response = await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new Error(`Google Sheets CSV export error ${response.status}: ${await response.text()}`);
  }

  const csv = await response.text();
  const rows = parseCsv(csv);

  const results: Omit<FaqItem, "id" | "createdAt" | "updatedAt">[] = [];

  // i = 1 to skip header row
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const question = values[3]?.trim();
    const answer = values[4]?.trim();

    if (!question || !answer) continue;

    const category = values[1]?.trim() || null;

    results.push({
      question,
      answer,
      category,
      sourceRow: i,
    });
  }

  return results;
}

/**
 * Minimal RFC 4180-compliant CSV parser.
 * Handles quoted fields (including commas and newlines inside quotes).
 */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  while (i < csv.length) {
    const ch = csv[i];

    if (inQuotes) {
      if (ch === '"') {
        // Escaped quote ("") → literal quote
        if (csv[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ",") {
        row.push(field);
        field = "";
        i++;
      } else if (ch === "\n" || (ch === "\r" && csv[i + 1] === "\n")) {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i += ch === "\r" ? 2 : 1;
      } else if (ch === "\r") {
        row.push(field);
        field = "";
        rows.push(row);
        row = [];
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // Push last field/row if content remains
  if (field || row.length > 0) {
    row.push(field);
    if (row.some((f) => f !== "")) {
      rows.push(row);
    }
  }

  return rows;
}
