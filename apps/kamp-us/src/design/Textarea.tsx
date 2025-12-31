import type {ComponentProps} from "react";
import styles from "./Textarea.module.css";

type TextareaProps = Omit<ComponentProps<"textarea">, "className">;

export function Textarea(props: TextareaProps) {
	return <textarea {...props} className={styles.Textarea} />;
}
