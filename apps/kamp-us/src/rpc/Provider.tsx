import {Registry} from "@effect-atom/atom";
import {RegistryProvider} from "@effect-atom/atom-react";
import type {ReactNode} from "react";

const registry = Registry.make();

export function RpcProvider({children}: {children: ReactNode}) {
	return <RegistryProvider registry={registry}>{children}</RegistryProvider>;
}
