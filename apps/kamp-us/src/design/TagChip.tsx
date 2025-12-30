import type {ComponentProps, ReactNode} from "react";
import {Link} from "react-router";

import styles from "./TagChip.module.css";

type TagChipProps = {
	/** Tag name to display */
	name: string;
	/** 6-digit hex color (without #) */
	color: string;
	/** Link destination for the tag name (makes name clickable) */
	to?: string;
	/** Additional content (e.g., remove button) rendered after name */
	children?: ReactNode;
} & Omit<ComponentProps<"span">, "className" | "style" | "children">;

export function TagChip({name, color, to, children, ...props}: TagChipProps) {
	return (
		<span
			{...props}
			className={styles.TagChip}
			style={{"--tag-color": `#${color}`} as React.CSSProperties}
		>
			<span className={styles.ColorDot} />
			{to ? (
				<Link to={to} className={styles.Name}>
					{name}
				</Link>
			) : (
				<span className={styles.Name}>{name}</span>
			)}
			{children}
		</span>
	);
}
