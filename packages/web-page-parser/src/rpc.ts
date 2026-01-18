import {Rpc, RpcGroup} from "@effect/rpc";
import {Schema} from "effect";
import {PageMetadata, ReaderResult} from "./schema.js";

export const WebPageParserRpcs = RpcGroup.make(
	Rpc.make("init", {
		payload: {url: Schema.String},
		success: Schema.Void,
	}),
	Rpc.make("getMetadata", {
		payload: Schema.Struct({forceFetch: Schema.optional(Schema.Boolean)}),
		success: PageMetadata,
	}),
	Rpc.make("getReaderContent", {
		payload: Schema.Struct({forceFetch: Schema.optional(Schema.Boolean)}),
		success: ReaderResult,
	}),
);

export type WebPageParserRpcs = typeof WebPageParserRpcs;
