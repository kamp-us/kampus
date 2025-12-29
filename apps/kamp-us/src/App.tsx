import {useState} from "react";
import viteLogo from "/vite.svg";
import cloudflareLogo from "./assets/Cloudflare_Logo.svg";
import reactLogo from "./assets/react.svg";
import {Button} from "./design/Button";

function App() {
	const [count, setCount] = useState(0);
	const [name, setName] = useState("unknown");

	return (
		<>
			<div>
				<a href="https://vite.dev" target="_blank" rel="noopener">
					<img src={viteLogo} className="logo" alt="Vite logo" />
				</a>
				<a href="https://react.dev" target="_blank" rel="noopener">
					<img src={reactLogo} className="logo react" alt="React logo" />
				</a>
				<a href="https://workers.cloudflare.com/" target="_blank">
					<img src={cloudflareLogo} className="logo cloudflare" alt="Cloudflare logo" />
				</a>
			</div>
			<h1>Vite + React + Cloudflare</h1>
			<div className="card">
				<Button onClick={() => setCount((count) => count + 1)} aria-label="increment">
					count is {count}
				</Button>
				<p>
					Edit <code>src/App.tsx</code> and save to test HMR
				</p>
			</div>
			<div className="card">
				<Button
					onClick={() => {
						fetch("/api/")
							.then((res) => res.json() as Promise<{name: string}>)
							.then((data) => setName(data.name));
					}}
					aria-label="get name"
				>
					Name from API is: {name}
				</Button>
				<p>
					Edit <code>worker/index.ts</code> to change the name
				</p>
			</div>
			<p className="read-the-docs">Click on the Vite and React logos to learn more</p>
		</>
	);
}

export default App;
