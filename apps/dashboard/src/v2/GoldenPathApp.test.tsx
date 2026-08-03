// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { GoldenPathApp } from "./GoldenPathApp";
import { RuntimeControlBar } from "./components/layout/RuntimeControlBar";
import { meteredArmRequired } from "./fixtures/golden-path";

afterEach(cleanup);

describe("GoldenPathApp shell", () => {
  it("renders only the three primary operator destinations", () => {
    render(<GoldenPathApp />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((tab) => tab.textContent)).toEqual([
      "Scanner",
      "Positions",
      "Research"
    ]);
    expect(screen.queryByRole("tab", { name: "Diagnostics" })).toBeNull();
  });

  it("supports roving primary navigation with Home, End, and arrows", async () => {
    const user = userEvent.setup();
    render(<GoldenPathApp />);
    const scanner = screen.getByRole("tab", { name: "Scanner" });
    scanner.focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Positions" })).toHaveFocus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Research" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(scanner).toHaveFocus();
  });

  it("traps the arm dialog, closes with Escape, and restores focus", async () => {
    const user = userEvent.setup();
    render(<RuntimeControlBar runtime={meteredArmRequired} onArm={async () => ({ message: "armed", runtime: meteredArmRequired })} />);
    const arm = screen.getByRole("button", { name: /arm/i });
    await user.click(arm);
    expect(screen.getByRole("dialog", { name: "Arm bounded metered data" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Close dialog" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(arm).toHaveFocus();
  });

  it("has no automated accessibility violations in the collapsed shell", async () => {
    const { container } = render(<GoldenPathApp />);
    const results = await axe.run(container, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps diagnostics behind the secondary menu and out of primary workflows", async () => {
    const user = userEvent.setup();
    render(<GoldenPathApp />);
    expect(screen.queryByText("Storage counts")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Positions" }));
    expect(screen.queryByText("Storage counts")).toBeNull();
    await user.click(screen.getByRole("tab", { name: "Research" }));
    expect(screen.queryByText("Storage counts")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Open secondary navigation" }));
    await user.click(screen.getByRole("menuitem", { name: "Developer diagnostics" }));
    expect(screen.getByRole("dialog", { name: "Developer diagnostics" })).toBeInTheDocument();
    expect(screen.getByText("Storage counts")).toBeInTheDocument();
  });
});
