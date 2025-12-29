import {Fieldset as BaseFieldset} from "@base-ui/react/fieldset";
import type {ComponentProps} from "react";

import styles from "./Fieldset.module.css";

type RootProps = Omit<ComponentProps<typeof BaseFieldset.Root>, "className">;

function Root({...props}: RootProps) {
	return <BaseFieldset.Root {...props} className={styles.root} />;
}

type LegendProps = Omit<ComponentProps<typeof BaseFieldset.Legend>, "className">;

function Legend({...props}: LegendProps) {
	return <BaseFieldset.Legend {...props} className={styles.legend} />;
}

export const Fieldset = {
	Root,
	Legend,
};
