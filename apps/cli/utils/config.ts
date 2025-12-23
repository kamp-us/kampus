import {existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {join} from "node:path";
import {homedir} from "node:os";

export interface Config {
	workerUrl?: string;
	sessionToken?: string;
	user?: {
		id: string;
		email: string;
		name?: string;
	};
}

const CONFIG_DIR = join(homedir(), ".kampus");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfig(): Config {
	if (!existsSync(CONFIG_FILE)) {
		return {};
	}

	try {
		const content = readFileSync(CONFIG_FILE, "utf-8");
		return JSON.parse(content) as Config;
	} catch (error) {
		console.error("Error reading config file:", error);
		return {};
	}
}

export function saveConfig(config: Partial<Config>): void {
	const currentConfig = getConfig();
	const newConfig: Config = {...currentConfig, ...config};

	// Ensure config directory exists
	if (!existsSync(CONFIG_DIR)) {
		mkdirSync(CONFIG_DIR, {recursive: true});
	}

	writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2), "utf-8");
}

export function getWorkerUrl(): string {
	const config = getConfig();
	return config.workerUrl || "http://localhost:8787";
}

export function getSessionToken(): string | undefined {
	const config = getConfig();
	return config.sessionToken;
}

export function clearSession(): void {
	const config = getConfig();
	delete config.sessionToken;
	delete config.user;
	saveConfig(config);
}

