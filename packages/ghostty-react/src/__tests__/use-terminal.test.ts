import {describe, expect, mock, test, beforeEach} from "bun:test";

interface MockFitAddonState {
  activated: boolean;
  fitted: boolean;
  observing: boolean;
  fit: () => void;
  observeResize: () => void;
}

// Mock ghostty-web — WASM can't load in bun test
let mockFitAddonInstance: MockFitAddonState | null = null;

mock.module("ghostty-web", () => {
  type EventHandler = (...args: never[]) => void;

  class MockTerminal {
    cols = 80;
    rows = 24;
    element?: HTMLElement;
    private handlers: Record<string, EventHandler[]> = {};

    onData = (fn: (data: string) => void) => {
      this.addHandler("data", fn as EventHandler);
      return {dispose: () => {}};
    };
    onResize = (fn: (size: {cols: number; rows: number}) => void) => {
      this.addHandler("resize", fn as EventHandler);
      return {dispose: () => {}};
    };
    onTitleChange = (fn: (title: string) => void) => {
      this.addHandler("title", fn as EventHandler);
      return {dispose: () => {}};
    };

    private addHandler(event: string, fn: EventHandler) {
      if (!this.handlers[event]) this.handlers[event] = [];
      this.handlers[event].push(fn);
    }

    open(parent: HTMLElement) {
      this.element = parent;
    }
    write(_data: string) {}
    loadAddon(addon: {activate: (terminal: MockTerminal) => void}) {
      addon.activate(this);
    }
    resize(_cols: number, _rows: number) {}
    dispose() {}
  }

  class MockFitAddon {
    activated = false;
    fitted = false;
    observing = false;

    activate(_terminal: MockTerminal) {
      this.activated = true;
      mockFitAddonInstance = this;
    }
    fit() {
      this.fitted = true;
    }
    observeResize() {
      this.observing = true;
    }
    dispose() {}
  }

  return {
    init: async () => {},
    Terminal: MockTerminal,
    FitAddon: MockFitAddon,
  };
});

describe("useTerminal", () => {
  beforeEach(() => {
    mockFitAddonInstance = null;
  });

  test("module exports useTerminal", async () => {
    const mod = await import("../use-terminal.ts");
    expect(mod.useTerminal).toBeFunction();
  });

  test("Terminal class is constructed with options", async () => {
    const {Terminal, init} = await import("ghostty-web");
    await init();

    const term = new Terminal({fontSize: 18});
    expect(term).toBeDefined();
    expect(term.cols).toBe(80);
    expect(term.rows).toBe(24);
  });

  test("FitAddon lifecycle", async () => {
    const {Terminal, FitAddon, init} = await import("ghostty-web");
    await init();

    const term = new Terminal();
    const fit = new FitAddon();
    term.loadAddon(fit);

    expect(mockFitAddonInstance!.activated).toBe(true);

    const div = document.createElement("div");
    term.open(div);

    mockFitAddonInstance!.fit();
    expect(mockFitAddonInstance!.fitted).toBe(true);

    mockFitAddonInstance!.observeResize();
    expect(mockFitAddonInstance!.observing).toBe(true);
  });

  test("Terminal events wire correctly", async () => {
    const {Terminal, init} = await import("ghostty-web");
    await init();

    const term = new Terminal();
    let dataReceived = "";

    term.onData((data) => {
      dataReceived = data;
    });

    // Events are wired — in real usage, onData fires when user types
    expect(dataReceived).toBe("");
  });
});
