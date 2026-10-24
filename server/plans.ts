import { createHash } from "node:crypto";
import { canonical, practicePlanRecords } from "../src/core/plans";
export const digest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
export const seededPlans = (now: number) =>
  practicePlanRecords(now).map((p) => ({ ...p, digest: digest(p) }));
