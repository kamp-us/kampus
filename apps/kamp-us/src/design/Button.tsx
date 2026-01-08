import {Button as BaseButton, type ButtonProps as BaseButtonProps} from "@base-ui/react/button";
import type {ComponentProps} from "react";

import styles from "./Button.module.css";

type ButtonProps = Omit<BaseButtonProps, "className"> & Pick<ComponentProps<"button">, "type">;

export function Button({...props}: ButtonProps) {
	return <BaseButton {...props} className={styles.Button} />;
}
