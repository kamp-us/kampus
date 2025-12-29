import {Field as BaseField} from "@base-ui/react/field";
import type {ReactNode} from "react";

import styles from "./Field.module.css";

interface FieldProps {
	label: string;
	description?: string;
	error?: string;
	control: ReactNode;
}

export function Field({label, description, error, control}: FieldProps) {
	return (
		<BaseField.Root className={styles.root}>
			<BaseField.Label className={styles.label}>{label}</BaseField.Label>
			{control}
			{description && (
				<BaseField.Description className={styles.description}>{description}</BaseField.Description>
			)}
			<BaseField.Error match={!!error} className={styles.error}>
				{error}
			</BaseField.Error>
		</BaseField.Root>
	);
}
