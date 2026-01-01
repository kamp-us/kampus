import type {RecordSourceSelectorProxy} from "relay-runtime";

export function updateConnectionCount(
	store: RecordSourceSelectorProxy,
	connectionId: string,
	delta: number,
) {
	const connection = store.get(connectionId);
	if (connection) {
		const currentCount = connection.getValue("totalCount");
		if (typeof currentCount === "number") {
			connection.setValue(currentCount + delta, "totalCount");
		}
	}
}
