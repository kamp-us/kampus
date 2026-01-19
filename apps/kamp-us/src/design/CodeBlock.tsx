import {useEffect, useState} from "react";
import {codeToHtml} from "shiki";
import styles from "./CodeBlock.module.css";

const getShikiTheme = () =>
	window.matchMedia("(prefers-color-scheme: dark)").matches ? "github-dark" : "github-light";

interface CodeBlockProps {
	code: string;
	language?: string;
}

export function CodeBlock({code, language}: CodeBlockProps) {
	const [html, setHtml] = useState<string | null>(null);

	useEffect(() => {
		if (!language) {
			setHtml(null);
			return;
		}

		let cancelled = false;
		codeToHtml(code, {
			lang: language,
			theme: getShikiTheme(),
		})
			.then((result) => {
				if (!cancelled) setHtml(result);
			})
			.catch((error) => {
				console.warn(`Syntax highlighting failed for language "${language}":`, error);
			});

		return () => {
			cancelled = true;
		};
	}, [code, language]);

	if (html) {
		// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki output is safe
		return <div className={styles.codeBlock} dangerouslySetInnerHTML={{__html: html}} />;
	}

	return (
		<pre className={styles.codeBlock}>
			<code>{code}</code>
		</pre>
	);
}
