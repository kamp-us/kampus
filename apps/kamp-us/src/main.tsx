import {StrictMode} from "react";
import {createRoot} from "react-dom/client";
import {RelayEnvironmentProvider} from "react-relay";
import {createBrowserRouter, RouterProvider} from "react-router";

import "./design/phoenix.css";
import "./index.css";

import App from "./App.tsx";
import {AuthProvider} from "./auth/AuthContext";
import {Me} from "./components/Me";
import {Library} from "./pages/Library";
import {Login} from "./pages/Login";
import {ReaderPage} from "./pages/library/ReaderPage";
import {TagManagement} from "./pages/library/TagManagement";
import {environment} from "./relay/environment";
import {RpcProvider} from "./rpc/Provider";

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
	{
		path: "/me/library",
		element: <Library />,
	},
	{
		path: "/me/library/tags",
		element: (
			<RpcProvider>
				<TagManagement />
			</RpcProvider>
		),
	},
	{
		path: "/me/library/:storyId",
		element: <ReaderPage />,
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
