import * as XLSX from "xlsx";

export function rowsToWorkbook(
  rows: Record<string, unknown>[],
  sheetName: string,
): ArrayBuffer {
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  const ws = XLSX.utils.json_to_sheet(rows);
  return XLSX.utils.sheet_to_csv(ws);
}
