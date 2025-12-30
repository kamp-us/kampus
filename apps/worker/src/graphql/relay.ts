/**
 * Relay Node interface utilities for global ID encoding/decoding.
 *
 * Global IDs are base64-encoded strings in format "Type:localId".
 * Example: "Story:story_abc123" → "U3Rvcnk6c3RvcnlfYWJjMTIz"
 */

/**
 * Encodes a type and local ID into a globally unique, opaque ID.
 */
export function encodeGlobalId(type: string, id: string): string {
	return btoa(`${type}:${id}`);
}

/**
 * Decodes a global ID into its type and local ID components.
 * Returns null for malformed IDs (graceful degradation).
 */
export function decodeGlobalId(globalId: string): {type: string; id: string} | null {
	try {
		const decoded = atob(globalId);
		const colonIndex = decoded.indexOf(":");
		if (colonIndex === -1) return null;

		const type = decoded.slice(0, colonIndex);
		const id = decoded.slice(colonIndex + 1);

		if (!type || !id) return null;
		return {type, id};
	} catch {
		return null;
	}
}

/**
 * Type-safe node type constants.
 * Add new types here as they implement Node.
 */
export const NodeType = {
	Story: "Story",
	Tag: "Tag",
} as const;

export type NodeTypeName = (typeof NodeType)[keyof typeof NodeType];
