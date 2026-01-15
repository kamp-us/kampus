import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import {PageMetadata} from "./schema.js";

export const WebPageParserRpcs = RpcGroup.make(
	Rpc.make("init", {
		payload: {url: Schema.String},
		success: Schema.Void,
	}),
	Rpc.make("getMetadata", {
		payload: Schema.Struct({forceFetch: Schema.optional(Schema.Boolean)}),
		success: PageMetadata,
	}),
);

export type WebPageParserRpcs = typeof WebPageParserRpcs;
