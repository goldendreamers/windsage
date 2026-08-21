import test from "node:test";
import assert from "node:assert/strict";
import { formatWindLine } from "./club-api.mjs";

test("formatWindLine hebrew", () => {
  const line = formatWindLine({
    labelHe: "פריגול",
    statusHe: "מחזיק",
    windAvg: 16.2,
    windMax: 19,
    windDirectionHe: "מערב",
  });
  assert.match(line, /פריגול/);
  assert.match(line, /מחזיק/);
  assert.match(line, /16\.2/);
});
