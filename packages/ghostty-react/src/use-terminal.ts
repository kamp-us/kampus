import {FitAddon, Terminal, init} from "ghostty-web";
import type {ITerminalOptions, ITheme} from "ghostty-web";
import {useCallback, useEffect, useRef, useState} from "react";

export interface UseTerminalOptions {
  fontSize?: number;
  fontFamily?: string;
  theme?: ITheme;
  autoFit?: boolean;
  onData?: (data: string) => void;
  onResize?: (size: {cols: number; rows: number}) => void;
  onTitleChange?: (title: string) => void;
}

export interface UseTerminalResult {
  ref: (element: HTMLDivElement | null) => void;
  write: (data: string) => void;
  terminal: Terminal | null;
  ready: boolean;
}

/**
 * Core hook — initializes WASM, creates Terminal, manages lifecycle via callback ref.
 *
 * The callback ref pattern is key: when React mounts the div, the ref fires,
 * we call terminal.open(element). When it unmounts, we dispose. No useEffect
 * dependency on a ref object needed.
 */
export function useTerminal(options: UseTerminalOptions = {}): UseTerminalResult {
  const {fontSize = 14, fontFamily, theme, autoFit = true, onData, onResize, onTitleChange} =
    options;

  const [terminal, setTerminal] = useState<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const elementRef = useRef<HTMLDivElement | null>(null);
  const initializingRef = useRef(false);

  // Store all config in refs — changing these doesn't require terminal re-creation
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  const onTitleChangeRef = useRef(onTitleChange);
  const configRef = useRef({fontSize, fontFamily, theme, autoFit});

  useEffect(() => {
    onDataRef.current = onData;
  }, [onData]);
  useEffect(() => {
    onResizeRef.current = onResize;
  }, [onResize]);
  useEffect(() => {
    onTitleChangeRef.current = onTitleChange;
  }, [onTitleChange]);
  useEffect(() => {
    configRef.current = {fontSize, fontFamily, theme, autoFit};
  }, [fontSize, fontFamily, theme, autoFit]);

  // Stable write function — safe to call before terminal is ready (no-ops)
  const write = useCallback((data: string | Uint8Array) => {
    terminal?.write(data);
  }, [terminal]);

  // Callback ref: react to DOM element availability
  // Only re-creates when identity actually changes (no config deps)
  const ref = useCallback((element: HTMLDivElement | null) => {
    // Same element — nothing to do
    if (elementRef.current === element) return;

    // Cleanup previous terminal
    if (elementRef.current) {
      fitAddonRef.current?.dispose();
      fitAddonRef.current = null;
      setTerminal((prev) => {
        prev?.dispose();
        return null;
      });
    }

    elementRef.current = element;
    if (!element) return;
    if (initializingRef.current) return;

    initializingRef.current = true;

    // Initialize WASM and create terminal
    init()
      .then(() => {
        // Guard: element may have been removed during async init
        if (elementRef.current !== element) {
          initializingRef.current = false;
          return;
        }

        const {fontSize: fs, fontFamily: ff, theme: th, autoFit: af} = configRef.current;
        const termOptions: ITerminalOptions = {fontSize: fs, theme: th};
        if (ff) termOptions.fontFamily = ff;

        const term = new Terminal(termOptions);

        // Wire events before open() so we don't miss initial data
        term.onData((data) => onDataRef.current?.(data));
        term.onResize((size) => onResizeRef.current?.(size));
        term.onTitleChange((title) => onTitleChangeRef.current?.(title));

        // FitAddon — auto-resize terminal to container
        if (af) {
          const fitAddon = new FitAddon();
          term.loadAddon(fitAddon);
          fitAddonRef.current = fitAddon;
        }

        term.open(element);

        // Fit after open (needs renderer to be initialized)
        if (af && fitAddonRef.current) {
          fitAddonRef.current.fit();
          fitAddonRef.current.observeResize();
        }

        setTerminal(term);
        initializingRef.current = false;
      })
      .catch((err) => {
        console.error("[ghostty-react] Failed to initialize terminal:", err);
        initializingRef.current = false;
      });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      fitAddonRef.current?.dispose();
      fitAddonRef.current = null;
      setTerminal((prev) => {
        prev?.dispose();
        return null;
      });
    };
  }, []);

  return {ref, write, terminal, ready: terminal !== null};
}
