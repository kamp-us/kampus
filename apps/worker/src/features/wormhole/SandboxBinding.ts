import {Sandbox} from "@cloudflare/sandbox";
import {Context} from "effect";

export class SandboxBinding extends Context.Tag("wormhole/SandboxBinding")<
	SandboxBinding,
	DurableObjectNamespace<Sandbox>
>() {}
