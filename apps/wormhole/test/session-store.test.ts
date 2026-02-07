import {beforeEach, describe, expect, test, vi} from "vitest";
import {createMockPty, mockPtyState, resetPtyMock} from "./mocks/node-pty.ts";
import {SessionStore} from "../src/session-store.ts";

vi.mock("@lydell/node-pty", () => createMockPty());

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    resetPtyMock();
    store = new SessionStore();
  });

  test("create returns a session with unique id", () => {
    const s1 = store.create("id-1", 80, 24);
    const s2 = store.create("id-2", 80, 24);
    expect(s1.id).toBeTruthy();
    expect(s2.id).toBeTruthy();
    expect(s1.id).not.toBe(s2.id);
    expect(store.size).toBe(2);
  });

  test("get returns session by id", () => {
    const session = store.create("test-id", 80, 24);
    expect(store.get(session.id)).toBe(session);
  });

  test("get returns undefined for unknown id", () => {
    expect(store.get("nonexistent")).toBeUndefined();
  });

  test("remove disposes and deletes session", () => {
    const session = store.create("test-id", 80, 24);
    store.remove(session.id);

    expect(store.get(session.id)).toBeUndefined();
    expect(store.size).toBe(0);
    expect(session.isDisposed).toBe(true);
  });

  test("remove is idempotent", () => {
    const session = store.create("test-id", 80, 24);
    store.remove(session.id);
    store.remove(session.id); // no error
    expect(store.size).toBe(0);
  });

  test("attach replays buffered output from detached period", () => {
    const session = store.create("test-id", 80, 24);

    // Session starts detached — simulate PTY output while detached
    mockPtyState.dataCb?.("hello");
    mockPtyState.dataCb?.(" world");

    // Attach and collect replayed data
    const received: string[] = [];
    session.attach(
      "client-1",
      (data) => received.push(data),
      () => {},
      80,
      24,
    );

    expect(received).toEqual(["hello", " world"]);
  });

  test("attach replays output produced while attached then detached", () => {
    const session = store.create("test-id", 80, 24);

    // First attach — output flows through and is buffered
    const first: string[] = [];
    session.attach(
      "client-1",
      (data) => first.push(data),
      () => {},
      80,
      24,
    );
    mockPtyState.dataCb?.("line1");
    expect(first).toEqual(["line1"]);

    // Detach (simulating WS disconnect)
    session.detach("client-1");

    // Reattach — should replay "line1" from the buffer
    const second: string[] = [];
    session.attach(
      "client-2",
      (data) => second.push(data),
      () => {},
      80,
      24,
    );
    expect(second).toEqual(["line1"]);
  });

  test("no buffered data replayed when nothing was produced", () => {
    const session = store.create("test-id", 80, 24);

    const received: string[] = [];
    session.attach(
      "client-1",
      (data) => received.push(data),
      () => {},
      80,
      24,
    );

    expect(received).toEqual([]);
  });
});
