import type {ComponentProps, ReactNode} from "react";

import styles from "./IconButton.module.css";

type IconButtonProps = {
	label: string;
	children: ReactNode;
} & Omit<ComponentProps<"button">, "className">;

export function IconButton({label, children, ...props}: IconButtonProps) {
	return (
		<button type="button" aria-label={label} className={styles.IconButton} {...props}>
			{children}
		</button>
	);
}
