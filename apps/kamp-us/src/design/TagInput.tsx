import {Combobox} from "@base-ui/react/combobox";
import {useId, useMemo, useRef, useState} from "react";

import {TagChip} from "./TagChip";
import styles from "./TagInput.module.css";

export type Tag = {
	id: string;
	name: string;
	color: string;
};

type TagItem = Tag & {
	creatable?: string;
};

type TagInputProps = {
	/** Currently selected tags */
	selectedTags: Tag[];
	/** All available tags for selection */
	availableTags: Tag[];
	/** Called when selection changes */
	onChange: (tags: Tag[]) => void;
	/** Called when a new tag should be created */
	onCreate: (name: string) => Promise<Tag>;
	/** Placeholder text */
	placeholder?: string;
	/** Label for the input */
	label?: string;
};

export function TagInput({
	selectedTags,
	availableTags,
	onChange,
	onCreate,
	placeholder = "Add tags...",
	label,
}: TagInputProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const id = useId();

	const [query, setQuery] = useState("");
	const highlightedItemRef = useRef<TagItem | undefined>(undefined);

	// Filter out already selected tags
	const unselectedTags = useMemo(() => {
		const selectedIds = new Set(selectedTags.map((t) => t.id));
		return availableTags.filter((t) => !selectedIds.has(t.id));
	}, [availableTags, selectedTags]);

	// Build items list with "Create" option when needed
	const items = useMemo((): TagItem[] => {
		const trimmed = query.trim();
		const lowered = trimmed.toLowerCase();

		// Check if exact match exists (including already selected)
		const exactExists =
			availableTags.some((t) => t.name.toLowerCase() === lowered) ||
			selectedTags.some((t) => t.name.toLowerCase() === lowered);

		// Add creatable option if no exact match and input has value
		if (trimmed && !exactExists) {
			const creatableTag: TagItem = {
				id: `create:${lowered}`,
				name: `Create "${trimmed}"`,
				color: "888888",
				creatable: trimmed,
			};
			return [...unselectedTags, creatableTag];
		}

		return unselectedTags;
	}, [query, unselectedTags, availableTags, selectedTags]);

	async function handleCreate(name: string) {
		const trimmed = name.trim();
		if (!trimmed) return;

		const lowered = trimmed.toLowerCase();

		// Check if it already exists
		const existing = availableTags.find((t) => t.name.toLowerCase() === lowered);
		if (existing) {
			if (!selectedTags.some((t) => t.id === existing.id)) {
				onChange([...selectedTags, existing]);
			}
			setQuery("");
			return;
		}

		// Create new tag
		const newTag = await onCreate(trimmed);
		onChange([...selectedTags, newTag]);
		setQuery("");
	}

	function handleInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Enter" || highlightedItemRef.current) {
			return;
		}

		const trimmed = query.trim();
		if (trimmed === "") {
			return;
		}

		event.preventDefault();
		handleCreate(trimmed);
	}

	async function handleValueChange(nextTags: TagItem[]) {
		// Check if user selected a "creatable" option
		const creatableTag = nextTags.find(
			(t) => t.creatable && !selectedTags.some((s) => s.id === t.id),
		);

		if (creatableTag?.creatable) {
			await handleCreate(creatableTag.creatable);
			return;
		}

		// Regular selection - filter out creatable items
		onChange(nextTags.filter((t) => !t.creatable) as Tag[]);
		setQuery("");
	}

	return (
		<Combobox.Root
			multiple
			items={items}
			value={selectedTags}
			onValueChange={handleValueChange}
			inputValue={query}
			onInputValueChange={setQuery}
			onItemHighlighted={(item) => {
				highlightedItemRef.current = item;
			}}
		>
			<div className={styles.Container}>
				{label && (
					<label className={styles.Label} htmlFor={id}>
						{label}
					</label>
				)}
				<Combobox.Chips className={styles.Chips} ref={containerRef}>
					<Combobox.Value>
						{(tags: TagItem[]) => (
							<>
								{tags
									.filter((t) => !t.creatable)
									.map((tag) => (
										<Combobox.Chip key={tag.id} className={styles.Chip} aria-label={tag.name}>
											<TagChip name={tag.name} color={tag.color}>
												<Combobox.ChipRemove
													className={styles.ChipRemove}
													aria-label={`Remove ${tag.name}`}
												>
													<XIcon />
												</Combobox.ChipRemove>
											</TagChip>
										</Combobox.Chip>
									))}
								<Combobox.Input
									id={id}
									placeholder={tags.length > 0 ? "" : placeholder}
									className={styles.Input}
									onKeyDown={handleInputKeyDown}
								/>
							</>
						)}
					</Combobox.Value>
				</Combobox.Chips>
			</div>

			<Combobox.Portal>
				<Combobox.Positioner className={styles.Positioner} sideOffset={4} anchor={containerRef}>
					<Combobox.Popup className={styles.Popup}>
						<Combobox.Empty className={styles.Empty}>
							No tags found. Type to create one.
						</Combobox.Empty>
						<Combobox.List>
							{(tag: TagItem) =>
								tag.creatable ? (
									<Combobox.Item key={tag.id} className={styles.Item} value={tag}>
										<span className={styles.CreateIcon}>
											<PlusIcon />
										</span>
										<span>Create "{tag.creatable}"</span>
									</Combobox.Item>
								) : (
									<Combobox.Item key={tag.id} className={styles.Item} value={tag}>
										<span className={styles.ItemDot} style={{background: `#${tag.color}`}} />
										<span>{tag.name}</span>
									</Combobox.Item>
								)
							}
						</Combobox.List>
					</Combobox.Popup>
				</Combobox.Positioner>
			</Combobox.Portal>
		</Combobox.Root>
	);
}

function PlusIcon(props: React.ComponentProps<"svg">) {
	return (
		<svg
			width="12"
			height="12"
			viewBox="0 0 12 12"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.5"
			strokeLinecap="butt"
			strokeLinejoin="miter"
			aria-hidden="true"
			{...props}
		>
			<path d="M6 1v10M1 6h10" />
		</svg>
	);
}

function XIcon(props: React.ComponentProps<"svg">) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width={12}
			height={12}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			{...props}
		>
			<path d="M18 6 6 18" />
			<path d="m6 6 12 12" />
		</svg>
	);
}
