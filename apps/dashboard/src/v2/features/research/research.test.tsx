// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import {
  exitSignalToken,
  hardRejectToken,
  migratedToken,
  paperPositionToken
} from "../../fixtures/golden-path";
import { TokenResearchContent } from "./TokenResearchContent";

afterEach(cleanup);

describe("token research workflow", () => {
  it("explains readiness, derivatives, signal policy, drivers, blockers, and provenance", () => {
    render(<TokenResearchContent summary={migratedToken} detail={null} />);
    expect(screen.getByText("Derivative matrix")).toBeTruthy();
    expect(screen.getByText("Sample readiness")).toBeTruthy();
    expect(screen.getByText("Reference policy")).toBeTruthy();
    expect(screen.getByText(/price source/i)).toHaveTextContent("price source curve");
    expect(screen.getByText("Technical audit and reason codes")).toBeTruthy();
  });

  it("shows hard reject evidence honestly", () => {
    render(<TokenResearchContent summary={hardRejectToken} detail={null} />);
    expect(screen.getByText(/hard reject/i)).toBeTruthy();
    expect(screen.getByText("REJECT")).toBeTruthy();
  });

  it("preserves paper position and exit alert continuity", () => {
    const view = render(<TokenResearchContent summary={paperPositionToken} detail={null} />);
    expect(screen.getByText("open")).toBeTruthy();
    view.rerender(<TokenResearchContent summary={exitSignalToken} detail={null} />);
    expect(screen.getByText("paper-exit-fixture-1")).toBeTruthy();
    expect(screen.getByText("partially_closed")).toBeTruthy();
  });

  it("contains no live execution language or controls", () => {
    render(<TokenResearchContent summary={paperPositionToken} detail={null} />);
    expect(screen.queryByRole("button", { name: /buy|sell|swap|sign|send/i })).toBeNull();
    expect(screen.queryByText(/live buy|live sell/i)).toBeNull();
  });
});
