import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

describe("ConfirmDialog", () => {
  it("renders nothing when open=false", () => {
    render(
      <ConfirmDialog
        open={false}
        title="x"
        body="y"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders title + body + buttons when open", () => {
    render(
      <ConfirmDialog
        open
        title="Reset state?"
        body="This will wipe the demo seed."
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Reset state?")).toBeInTheDocument();
    expect(screen.getByText("This will wipe the demo seed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirm/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("fires onCancel when Cancel button is clicked", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="x"
        body="y"
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("fires onConfirm when Confirm button is clicked", () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmDialog
        open
        title="x"
        body="y"
        onCancel={() => {}}
        onConfirm={onConfirm}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("uses custom labels when provided", () => {
    render(
      <ConfirmDialog
        open
        title="x"
        body="y"
        confirmLabel="Roll back label"
        cancelLabel="Keep label"
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /roll back label/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /keep label/i })).toBeInTheDocument();
  });

  it("disables both buttons + shows 'Working…' when busy=true", () => {
    render(
      <ConfirmDialog
        open
        title="x"
        body="y"
        busy
        onCancel={() => {}}
        onConfirm={() => {}}
      />,
    );
    const confirmBtn = screen.getByRole("button", { name: /working/i });
    const cancelBtn = screen.getByRole("button", { name: /cancel/i });
    expect(confirmBtn).toBeDisabled();
    expect(cancelBtn).toBeDisabled();
  });

  it("closes on Escape key when not busy", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="x"
        body="y"
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("does NOT close on Escape when busy=true", () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        open
        title="x"
        body="y"
        busy
        onCancel={onCancel}
        onConfirm={() => {}}
      />,
    );
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onCancel).not.toHaveBeenCalled();
  });
});
