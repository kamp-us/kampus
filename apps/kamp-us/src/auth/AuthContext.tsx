import {createContext, type ReactNode, useCallback, useContext, useState} from "react";
import {resetSubscriptionClient} from "../relay/environment";

interface User {
	id: string;
	email: string;
	name?: string;
}

interface AuthState {
	user: User | null;
	token: string | null;
}

interface AuthContextValue extends AuthState {
	login: (user: User, token: string) => void;
	logout: () => void;
	isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = "kampus_auth";

function loadAuthState(): AuthState {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			return JSON.parse(stored);
		}
	} catch {
		// Ignore parse errors
	}
	return {user: null, token: null};
}

function saveAuthState(state: AuthState) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function clearAuthState() {
	localStorage.removeItem(STORAGE_KEY);
}

export function AuthProvider({children}: {children: ReactNode}) {
	const [authState, setAuthState] = useState<AuthState>(loadAuthState);

	const login = useCallback((user: User, token: string) => {
		const newState = {user, token};
		setAuthState(newState);
		saveAuthState(newState);
	}, []);

	const logout = useCallback(() => {
		setAuthState({user: null, token: null});
		clearAuthState();
		resetSubscriptionClient();
	}, []);

	const value: AuthContextValue = {
		...authState,
		login,
		logout,
		isAuthenticated: !!authState.token,
	};

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (!context) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}

export function getStoredToken(): string | null {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored) {
			const parsed = JSON.parse(stored);
			return parsed.token || null;
		}
	} catch {
		// Ignore
	}
	return null;
}
