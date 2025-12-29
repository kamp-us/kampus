import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {createBrowserRouter, RouterProvider} from "react-router";
import {RelayEnvironmentProvider} from "react-relay";

import "./design/phoenix.css";
import "./index.css";

import App from "./App.tsx";
import {Me} from "./components/Me";
import {Login} from "./pages/Login";
import {AuthProvider} from "./auth/AuthContext";
import {environment} from "./relay/environment";

const router = createBrowserRouter([
	{
		path: "/",
		element: <App />,
	},
	{
		path: "/login",
		element: <Login />,
	},
	{
		path: "/me",
		element: <Me />,
	},
]);

const root = document.getElementById("root");

if (root) {
	createRoot(root).render(
		<StrictMode>
			<AuthProvider>
				<RelayEnvironmentProvider environment={environment}>
					<RouterProvider router={router} />
				</RelayEnvironmentProvider>
			</AuthProvider>
		</StrictMode>,
	);
}
