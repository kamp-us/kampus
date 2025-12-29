import {Input as BaseInput} from "@base-ui/react/input";
import type {ComponentProps} from "react";

import styles from "./Input.module.css";

type InputProps = Omit<ComponentProps<typeof BaseInput>, "className">;

export function Input(props: InputProps) {
	return <BaseInput {...props} className={styles.Input} />;
}
