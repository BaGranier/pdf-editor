import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createTextStamp } from "../editing/stamps";
import { StampInspector } from "./StampInspector";

describe("StampInspector", () => {
  it("edits custom text, opacity, rotation, font and border", () => {
    const onUpdate = vi.fn(), onFinish = vi.fn(), onDelete = vi.fn();
    const edit = createTextStamp(1, { x0: 10, y0: 10, x1: 230, y1: 100 }, "APPROUVÉ", false);
    render(<StampInspector edit={edit} onUpdate={onUpdate} onFinish={onFinish} onDelete={onDelete} />);
    fireEvent.change(screen.getByLabelText("Libellé du tampon"), { target: { value: "PRIVÉ" } });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ text: "PRIVÉ" }), "text");
    fireEvent.change(screen.getByLabelText("Opacité du tampon"), { target: { value: "50" } });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ opacity: 0.5 }), "opacity");
    fireEvent.pointerUp(screen.getByLabelText("Opacité du tampon"));
    expect(onFinish).toHaveBeenCalledWith("opacity");
    fireEvent.change(screen.getByLabelText("Rotation du tampon"), { target: { value: "30" } });
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ rotation: 30 }), "rotation");
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le tampon" }));
    expect(onDelete).toHaveBeenCalledOnce();
  });
});
