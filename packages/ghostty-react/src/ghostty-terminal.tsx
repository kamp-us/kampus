import type {ITheme} from "ghostty-web";
import {useWebSocketTerminal} from "./use-websocket-terminal.ts";

export interface GhosttyTerminalProps {
  url: string;
  sessionId?: string | null;
  fontSize?: number;
  fontFamily?: string;
  theme?: ITheme;
  reconnect?: boolean;
  className?: string;
}

export function GhosttyTerminal(props: GhosttyTerminalProps) {
  const {url, sessionId, fontSize, fontFamily, theme, reconnect, className} = props;

  const {ref} = useWebSocketTerminal({url, sessionId, fontSize, fontFamily, theme, reconnect});

  return <div ref={ref} className={className} />;
}
