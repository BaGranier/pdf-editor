import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ImageCropEditor } from "./ImageCropEditor";

it("keeps drafts private until validation and cancels Escape", () => {
  const onApply = vi.fn(), onCancel = vi.fn();
  const crop = { x: .1, y: .1, width: .5, height: .5 };
  render(<ImageCropEditor initial={crop} onApply={onApply} onCancel={onCancel} />);
  fireEvent.keyDown(screen.getByLabelText("Rogner se"), { key: "ArrowRight" });
  expect(onApply).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Valider le rognage" }));
  expect(onApply).toHaveBeenCalledWith({ ...crop, x: .11 });
  fireEvent.keyDown(window, { key: "Escape" });
  expect(onCancel).toHaveBeenCalledOnce();
});
