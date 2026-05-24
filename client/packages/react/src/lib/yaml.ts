export function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);

  if (value === null || value === undefined) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "string") return formatString(value, indent);

  if (Array.isArray(value)) {
    if (value.length === 0) return "[]";
    return value
      .map((v) => {
        if (isNonEmptyObject(v)) {
          return `${pad}-\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}- ${toYaml(v, indent + 1)}`;
      })
      .join("\n");
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return "{}";
    return entries
      .map(([k, v]) => {
        if (isNonEmptyObject(v)) {
          return `${pad}${k}:\n${toYaml(v, indent + 1)}`;
        }
        return `${pad}${k}: ${toYaml(v, indent + 1)}`;
      })
      .join("\n");
  }

  return String(value);
}

function isNonEmptyObject(v: unknown): boolean {
  if (v === null || typeof v !== "object") return false;
  if (Array.isArray(v)) return v.length > 0;
  return Object.keys(v as object).length > 0;
}

function formatString(value: string, indent: number): string {
  if (value === "") return '""';
  if (value.includes("\n")) {
    const pad = "  ".repeat(indent + 1);
    return "|\n" + value.split("\n").map((line) => pad + line).join("\n");
  }
  if (
    /^[\s"'`{}[\]&*!|>?#%@,-]/.test(value) ||
    /:\s|\s#/.test(value) ||
    /^(true|false|null|yes|no|on|off|~)$/i.test(value) ||
    /^-?\d/.test(value)
  ) {
    return JSON.stringify(value);
  }
  return value;
}
