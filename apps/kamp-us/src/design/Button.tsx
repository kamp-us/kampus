import {Button as BaseButton} from "@base-ui/react/button";
import type {ComponentProps} from "react";

import styles from "./Button.module.css";

type ButtonProps = Omit<ComponentProps<typeof BaseButton>, "className">;

export function Button({...props}: ButtonProps) {
	return <BaseButton {...props} className={styles.Button} />;
}
