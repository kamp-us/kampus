/**
 * Session lifecycle management service.
 *
 * @since 0.0.1
 */
import {Effect} from "effect";
import * as internal from "./internal/sessionStore.ts";

/**
 * @since 0.0.1
 * @category tags
 */
export class SessionStore extends Effect.Service<SessionStore>()("@kampus/wormhole/SessionStore", {
	effect: internal.make,
	dependencies: [],
}) {}
