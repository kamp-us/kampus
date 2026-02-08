/**
 * Shared mock state for @lydell/node-pty.
 *
 * Usage: import this module in test files, then use `vi.mock("@lydell/node-pty", ...)`
 * with a factory that delegates to `createMockPty()`. The callbacks and resize calls
 * are stored on `mockPtyState` so tests can access them.
 *
 * Call `resetPtyMock()` in beforeEach to reset state between tests.
 */

export const mockPtyState = {
	dataCb: null as ((data: string) => void) | null,
	exitCb: null as ((e: {exitCode: number}) => void) | null,
	resizeCalls: [] as Array<{cols: number; rows: number}>,
}

export function resetPtyMock(): void {
	mockPtyState.dataCb = null
	mockPtyState.exitCb = null
	mockPtyState.resizeCalls = []
}

export function createMockPty() {
	return {
		default: {
			spawn: () => ({
				onData: (cb: (data: string) => void) => {
					mockPtyState.dataCb = cb
				},
				onExit: (cb: (e: {exitCode: number}) => void) => {
					mockPtyState.exitCb = cb
				},
				resize: (cols: number, rows: number) => {
					mockPtyState.resizeCalls.push({cols, rows})
				},
				write: () => {},
				kill: () => {},
			}),
		},
	}
}
