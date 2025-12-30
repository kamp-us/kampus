import {AlertDialog as BaseAlertDialog} from "@base-ui/react/alert-dialog";
import type {ComponentProps} from "react";
import styles from "./AlertDialog.module.css";

function Root(props: ComponentProps<typeof BaseAlertDialog.Root>) {
	return <BaseAlertDialog.Root {...props} />;
}

function Trigger(props: ComponentProps<typeof BaseAlertDialog.Trigger>) {
	return <BaseAlertDialog.Trigger {...props} />;
}

function Portal(props: ComponentProps<typeof BaseAlertDialog.Portal>) {
	return <BaseAlertDialog.Portal {...props} />;
}

function Backdrop(props: ComponentProps<typeof BaseAlertDialog.Backdrop>) {
	return <BaseAlertDialog.Backdrop className={styles.Backdrop} {...props} />;
}

function Popup(props: ComponentProps<typeof BaseAlertDialog.Popup>) {
	return <BaseAlertDialog.Popup className={styles.Popup} {...props} />;
}

function Title(props: ComponentProps<typeof BaseAlertDialog.Title>) {
	return <BaseAlertDialog.Title className={styles.Title} {...props} />;
}

function Description(props: ComponentProps<typeof BaseAlertDialog.Description>) {
	return <BaseAlertDialog.Description className={styles.Description} {...props} />;
}

function Close(props: ComponentProps<typeof BaseAlertDialog.Close>) {
	return <BaseAlertDialog.Close {...props} />;
}

export const AlertDialog = {
	Root,
	Trigger,
	Portal,
	Backdrop,
	Popup,
	Title,
	Description,
	Close,
};
