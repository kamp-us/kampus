// apps/kamp-us/src/wormhole/SessionBar.tsx
import {useMux} from "./MuxClient.tsx";

export function SessionBar() {
	const {state, createSession, destroySession} = useMux();

	return (
		<div
			data-component="session-bar"
			style={{display: "flex", gap: 8, padding: "4px 8px", borderBottom: "1px solid var(--border, #333)"}}
		>
			{state.sessions.map((session) => (
				<div key={session.id} style={{display: "flex", alignItems: "center", gap: 4}}>
					<span>{session.name}</span>
					<button
						type="button"
						onClick={() => destroySession(session.id)}
						aria-label={`Destroy session ${session.name}`}
					>
						&times;
					</button>
				</div>
			))}
			<button type="button" onClick={() => createSession(`session-${state.sessions.length + 1}`)}>
				+ Session
			</button>
		</div>
	);
}
