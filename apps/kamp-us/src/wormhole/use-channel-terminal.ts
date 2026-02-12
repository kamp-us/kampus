import {useEffect} from "react";
import type {ITheme} from "ghostty-web";
import {useTerminal} from "@kampus/ghostty-react";
import {useWormholeGateway} from "./WormholeGateway.tsx";

export interface UseChannelTerminalOptions {
  channel: number;
  sessionId: string;
  fontSize?: number;
  fontFamily?: string;
  theme?: ITheme;
}

export function useChannelTerminal(options: UseChannelTerminalOptions) {
  const {channel, sessionId, fontSize, fontFamily, theme} = options;
  const gateway = useWormholeGateway();

  const {ref, write, terminal, ready} = useTerminal({
    fontSize,
    fontFamily,
    theme,
    onData: (data) => gateway.sendInput(channel, data),
    onResize: (size) => gateway.resizeSession(sessionId, size.cols, size.rows),
  });

  useEffect(() => {
    if (!ready) return;
    return gateway.subscribe(channel, (data) => write(data));
  }, [ready, channel, gateway, write]);

  return {ref, terminal, ready};
}
