import {TextAttributes} from "@opentui/core";
import {useKeyboard} from "@opentui/react";
import {useState} from "react";
import {deriveNaming} from "../../../generators/spellbook/naming";
import type {Column, GeneratorOptions, Naming} from "../../../generators/spellbook/types";

export type Phase =
	| {type: "input"; columns: Column[]}
	| {type: "confirm"; columns: Column[]}
	| {type: "generating"; columns: Column[]; progress: string[]}
	| {type: "success"; files: string[]}
	| {type: "error"; message: string};

export type SpellbookAppProps = {
	options: GeneratorOptions;
	onComplete: (columns: Column[]) => void;
	onCancel: () => void;
};

export const SpellbookApp = ({options, onComplete, onCancel}: SpellbookAppProps) => {
	const naming = deriveNaming(options.featureName, options.table, options.idPrefix);
	const [phase, setPhase] = useState<Phase>({type: "input", columns: []});

	useKeyboard((key) => {
		// Ctrl+C cancels
		if (key.ctrl && key.name === "c") {
			onCancel();
		}
	});

	return (
		<box style={{flexDirection: "column", padding: 1}}>
			<Header naming={naming} />
			{phase.type === "input" && (
				<ColumnInputPhase
					columns={phase.columns}
					onColumnsChange={(columns) => setPhase({type: "input", columns})}
					onConfirm={(columns) => setPhase({type: "confirm", columns})}
				/>
			)}
			{phase.type === "confirm" && (
				<ConfirmPhase
					columns={phase.columns}
					onConfirm={() => onComplete(phase.columns)}
					onBack={() => setPhase({type: "input", columns: phase.columns})}
				/>
			)}
		</box>
	);
};

type HeaderProps = {
	naming: Naming;
};

const Header = ({naming}: HeaderProps) => {
	return (
		<box style={{flexDirection: "column", marginBottom: 1}}>
			<text
				content={`Creating ${naming.className} Spellbook...`}
				style={{fg: "#4a90d9", attributes: TextAttributes.BOLD}}
			/>
			<text content={`Package: ${naming.packageName}`} style={{fg: "#888888"}} />
		</box>
	);
};

const COLUMN_TYPES = ["text", "integer", "boolean", "timestamp"] as const;

type ColumnInputPhaseProps = {
	columns: Column[];
	onColumnsChange: (columns: Column[]) => void;
	onConfirm: (columns: Column[]) => void;
};

const ColumnInputPhase = ({columns, onColumnsChange, onConfirm}: ColumnInputPhaseProps) => {
	const [name, setName] = useState("");
	const [typeIndex, setTypeIndex] = useState(0);
	const [nullable, setNullable] = useState(false);
	const [field, setField] = useState<"name" | "type" | "nullable">("name");

	useKeyboard((key) => {
		// Empty name + Enter on name field = finish adding columns
		if (key.name === "return" && field === "name" && name === "") {
			onConfirm(columns);
			return;
		}

		// Tab cycles through fields
		if (key.name === "tab") {
			if (field === "name" && name !== "") {
				setField("type");
			} else if (field === "type") {
				setField("nullable");
			} else if (field === "nullable") {
				// Add column and reset
				const newColumn: Column = {
					name,
					type: COLUMN_TYPES[typeIndex],
					nullable,
				};
				onColumnsChange([...columns, newColumn]);
				setName("");
				setTypeIndex(0);
				setNullable(false);
				setField("name");
			}
			return;
		}

		// Type selection: left/right arrows cycle options
		if (field === "type") {
			if (key.name === "left") {
				setTypeIndex((i) => (i - 1 + COLUMN_TYPES.length) % COLUMN_TYPES.length);
			} else if (key.name === "right") {
				setTypeIndex((i) => (i + 1) % COLUMN_TYPES.length);
			}
		}

		// Nullable toggle: space or left/right
		if (field === "nullable") {
			if (key.name === "space" || key.name === "left" || key.name === "right") {
				setNullable((n) => !n);
			}
		}

		// Enter on nullable = submit column
		if (key.name === "return" && field === "nullable" && name !== "") {
			const newColumn: Column = {
				name,
				type: COLUMN_TYPES[typeIndex],
				nullable,
			};
			onColumnsChange([...columns, newColumn]);
			setName("");
			setTypeIndex(0);
			setNullable(false);
			setField("name");
		}
	});

	return (
		<box style={{flexDirection: "column"}}>
			<text content="Define columns (empty name to finish):" style={{marginBottom: 1}} />

			{/* Already added columns */}
			{columns.length > 0 && (
				<box style={{marginBottom: 1, flexDirection: "column"}}>
					{columns.map((col, i) => (
						<text
							key={i}
							content={`  ${col.name}: ${col.type}${col.nullable ? " (nullable)" : ""}`}
							style={{fg: "#888888"}}
						/>
					))}
				</box>
			)}

			{/* Column name input */}
			<box title="Column Name" style={{border: true, width: 40, height: 3}}>
				<input
					value={name}
					onInput={setName}
					focused={field === "name"}
					placeholder="Enter column name"
					style={{focusedBackgroundColor: "#000000"}}
				/>
			</box>

			{/* Type selector */}
			<box style={{marginTop: 1, flexDirection: "row"}}>
				<text content="Type: " />
				{COLUMN_TYPES.map((t, i) => (
					<text
						key={t}
						content={`[${t}]`}
						style={{
							marginRight: 1,
							bg: i === typeIndex ? (field === "type" ? "#4a90d9" : "#555") : undefined,
							fg: i === typeIndex ? "#fff" : "#888",
						}}
					/>
				))}
				{field === "type" && <text content=" ←/→ to change" style={{fg: "#666"}} />}
			</box>

			{/* Nullable toggle */}
			<box style={{marginTop: 1, flexDirection: "row"}}>
				<text content="Nullable: " />
				<text
					content={`[${nullable ? "YES" : "NO"}]`}
					style={{
						bg: field === "nullable" ? "#4a90d9" : undefined,
						fg: nullable ? "#0f0" : "#f00",
					}}
				/>
				{field === "nullable" && (
					<text content=" space to toggle, Enter to add" style={{fg: "#666"}} />
				)}
			</box>

			<text content="Tab to navigate, Enter to submit" style={{marginTop: 1, fg: "#666"}} />
		</box>
	);
};

type ConfirmPhaseProps = {
	columns: Column[];
	onConfirm: () => void;
	onBack: () => void;
};

const ConfirmPhase = ({columns, onConfirm, onBack}: ConfirmPhaseProps) => {
	useKeyboard((key) => {
		if (key.name === "return" || key.name === "y") {
			onConfirm();
		} else if (key.name === "n" || key.name === "escape") {
			onBack();
		}
	});

	return (
		<box style={{flexDirection: "column"}}>
			<text content="Column Summary:" style={{attributes: TextAttributes.BOLD, marginBottom: 1}} />
			{columns.length === 0 ? (
				<text
					content="  (no columns defined - will generate minimal schema)"
					style={{fg: "#888888"}}
				/>
			) : (
				columns.map((col, i) => (
					<text
						key={i}
						content={`  ${col.name}: ${col.type}${col.nullable ? " (nullable)" : ""}`}
						style={{fg: "#888888"}}
					/>
				))
			)}
			<text content="" />
			<text content="Proceed with generation? [Y/n]" style={{fg: "#4a90d9"}} />
		</box>
	);
};
