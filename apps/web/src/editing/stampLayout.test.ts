import { describe, expect, it } from "vitest";
import { createTextStamp } from "./stamps";
import { layoutStamp, stampPalette } from "./stampLayout";

const rect = { x0: 0, y0: 0, x1: 220, y1: 90 };
describe("harmonized stamps", () => {
  it.each(["REÇU", "CONFIDENTIEL", "BROUILLON", "REÇU\n16/11/2026"])("fits actual ink bounds for %s and grows with geometry", (text) => {
    const edit = createTextStamp(1, rect, text, false);
    const small = layoutStamp(edit, 220, 90), large = layoutStamp(edit, 440, 180);
    expect(small.overflow).toBe(false);
    expect(large.fontSize).toBeGreaterThan(small.fontSize * 1.9);
    expect(large.overflow).toBe(false);
    expect(edit.fillOpacity).toBe(0.1);
    expect(stampPalette(edit)).toEqual({ text: edit.color, border: edit.color, fill: edit.color });
  });
  it("handles tiny frames, manual overflow, individual colors and font changes", () => {
    const edit = createTextStamp(1, rect, "CONFIDENTIEL", false);
    expect(layoutStamp({ ...edit, border: false }, 4, 4).overflow).toBe(false);
    expect(layoutStamp({ ...edit, fontSizeMode: "manual", fontSize: 144 }, 220, 90).overflow).toBe(true);
    expect(stampPalette({ ...edit, linkedColors: false, textColor: "#111111", borderColor: "#222222", fillColor: "#333333" })).toEqual({ text: "#111111", border: "#222222", fill: "#333333" });
    expect(layoutStamp({ ...edit, fontFamily: "Courier" }, 220, 90).fontSize).not.toBe(layoutStamp(edit, 220, 90).fontSize);
  });
});
