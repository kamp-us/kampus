import type {Sandbox} from "@cloudflare/sandbox";
import {Context} from "effect";

export class SandboxBinding extends Context.Tag("sandbox/SandboxBinding")<
	SandboxBinding,
	DurableObjectNamespace<Sandbox>
>() {}
