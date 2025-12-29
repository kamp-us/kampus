import {useState, type ComponentProps} from "react";

import {EyeIcon} from "./icons/EyeIcon";
import {EyeOffIcon} from "./icons/EyeOffIcon";
import {IconButton} from "./IconButton";
import {Input} from "./Input";
import styles from "./PasswordInput.module.css";

type PasswordInputProps = Omit<ComponentProps<typeof Input>, "type">;

export function PasswordInput(props: PasswordInputProps) {
	const [visible, setVisible] = useState(false);

	return (
		<div className={styles.wrapper}>
			<Input {...props} type={visible ? "text" : "password"} />
			<IconButton
				label={visible ? "Hide password" : "Show password"}
				onClick={() => setVisible(!visible)}
			>
				{visible ? <EyeOffIcon /> : <EyeIcon />}
			</IconButton>
		</div>
	);
}
