import {Popover} from "@base-ui/react/popover";
import type {ComponentProps} from "react";

import styles from "./ColorPicker.module.css";

const TAG_COLORS = [
	{hex: "FF6B6B", name: "Red"},
	{hex: "4ECDC4", name: "Teal"},
	{hex: "45B7D1", name: "Blue"},
	{hex: "FFA07A", name: "Orange"},
	{hex: "98D8C8", name: "Mint"},
	{hex: "F7DC6F", name: "Yellow"},
	{hex: "BB8FCE", name: "Purple"},
	{hex: "85C1E2", name: "Sky"},
] as const;

type ColorPickerProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	selectedColor: string;
	onSelect: (color: string) => void;
	anchor?: ComponentProps<typeof Popover.Positioner>["anchor"];
};

export function ColorPicker({
	open,
	onOpenChange,
	selectedColor,
	onSelect,
	anchor,
}: ColorPickerProps) {
	return (
		<Popover.Root open={open} onOpenChange={onOpenChange}>
			<Popover.Portal>
				<Popover.Positioner anchor={anchor} sideOffset={4} className={styles.Positioner}>
					<Popover.Popup className={styles.Popup}>
						<div className={styles.Swatches}>
							{TAG_COLORS.map(({hex, name}) => (
								<button
									key={hex}
									type="button"
									className={styles.Swatch}
									style={{backgroundColor: `#${hex}`}}
									aria-label={name}
									aria-pressed={hex.toLowerCase() === selectedColor.toLowerCase()}
									onClick={() => {
										onSelect(hex.toLowerCase());
										onOpenChange(false);
									}}
								/>
							))}
						</div>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	);
}

export {TAG_COLORS};
