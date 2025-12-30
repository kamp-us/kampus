import {Menu as BaseMenu} from "@base-ui/react/menu";
import type {ComponentProps} from "react";
import styles from "./Menu.module.css";

function Root(props: ComponentProps<typeof BaseMenu.Root>) {
	return <BaseMenu.Root {...props} />;
}

type TriggerProps = Omit<ComponentProps<typeof BaseMenu.Trigger>, "className">;

function Trigger(props: TriggerProps) {
	return <BaseMenu.Trigger className={styles.Trigger} {...props} />;
}

function Portal(props: ComponentProps<typeof BaseMenu.Portal>) {
	return <BaseMenu.Portal {...props} />;
}

function Positioner(props: ComponentProps<typeof BaseMenu.Positioner>) {
	return <BaseMenu.Positioner className={styles.Positioner} sideOffset={4} {...props} />;
}

function Popup(props: ComponentProps<typeof BaseMenu.Popup>) {
	return <BaseMenu.Popup className={styles.Popup} {...props} />;
}

function Item(props: ComponentProps<typeof BaseMenu.Item>) {
	return <BaseMenu.Item className={styles.Item} {...props} />;
}

function Separator(props: ComponentProps<typeof BaseMenu.Separator>) {
	return <BaseMenu.Separator className={styles.Separator} {...props} />;
}

export const Menu = {
	Root,
	Trigger,
	Portal,
	Positioner,
	Popup,
	Item,
	Separator,
};
