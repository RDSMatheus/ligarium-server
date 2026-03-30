import { randomUUID } from "node:crypto";

export function generateId(prefix = ""): string {
  return prefix + randomUUID();
}
