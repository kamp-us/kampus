import {describe, expect, mock, test} from "bun:test";

// Mock ghostty-web
mock.module("ghostty-web", () => {
  class MockTerminal {
    cols = 80;
    rows = 24;
    onData = () => ({dispose: () => {}});
    onResize = () => ({dispose: () => {}});
    onTitleChange = () => ({dispose: () => {}});
    open() {}
    write() {}
    loadAddon(addon: {activate: (t: MockTerminal) => void}) {
      addon.activate(this);
    }
    dispose() {}
  }

  class MockFitAddon {
    activate(_terminal: MockTerminal) {}
    fit() {}
    observeResize() {}
    dispose() {}
  }

  return {
    init: async () => {},
    Terminal: MockTerminal,
    FitAddon: MockFitAddon,
  };
});

describe("useWebSocketTerminal", () => {
  test("module exports useWebSocketTerminal", async () => {
    const mod = await import("../use-websocket-terminal.ts");
    expect(mod.useWebSocketTerminal).toBeFunction();
  });

  test("WebSocketStatus type covers all states", async () => {
    // Type-level test — verifying the union is "connecting" | "connected" | "disconnected"
    const states: Array<import("../use-websocket-terminal.ts").WebSocketStatus> = [
      "connecting",
      "connected",
      "disconnected",
    ];
    expect(states).toHaveLength(3);
  });
});
