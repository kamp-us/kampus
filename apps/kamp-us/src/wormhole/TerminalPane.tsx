import type {ITheme} from "ghostty-web";
import {useChannelTerminal} from "./use-channel-terminal.ts";
import styles from "./WormholeLayout.module.css";

interface TerminalPaneProps {
  channel: number;
  sessionId: string;
  focused: boolean;
  onFocus: () => void;
  theme?: ITheme;
}

export function TerminalPane({channel, sessionId, focused, onFocus, theme}: TerminalPaneProps) {
  const {ref} = useChannelTerminal({channel, sessionId, theme});

  return (
    <div
      className={styles.pane}
      data-focused={focused || undefined}
      onClick={onFocus}
      ref={ref}
    />
  );
}
