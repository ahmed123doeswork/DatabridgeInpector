// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes
// ("" inside a quoted field), and commas/newlines inside quotes. No external
// dependency needed for the demo's input sizes (capped at 2,000 rows).

export interface ParsedCsv {
  header: string[];
  rows: string[][];
}

export function parseCsv(content: string): ParsedCsv {
  const records: string[][] = [];
  let field = "";
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  const text = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  function pushField() {
    record.push(field);
    field = "";
  }

  function pushRecord() {
    pushField();
    records.push(record);
    record = [];
  }

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      pushField();
      i += 1;
      continue;
    }
    if (ch === "\n") {
      pushRecord();
      i += 1;
      continue;
    }
    field += ch;
    i += 1;
  }

  // Trailing field/record (file not ending in a newline).
  if (field.length > 0 || record.length > 0) {
    pushRecord();
  }

  const nonEmpty = records.filter((r) => !(r.length === 1 && r[0] === ""));
  const [header, ...rows] = nonEmpty;
  return { header: header ?? [], rows };
}

/** rowId convention shared across the stack: 1-indexed data row, header excluded. */
export function rowIdFor(index0: number): string {
  return `row-${index0 + 1}`;
}
