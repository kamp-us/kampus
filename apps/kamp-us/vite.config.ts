import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'

import { cloudflare } from "@cloudflare/vite-plugin";

/**
 * Dev-only plugin: pipes browser console.log to terminal.
 * Browser POSTs to /__console, plugin prints to stdout.
 * Injects a tiny snippet that monkey-patches console.log/warn/error.
 */
function browserConsoleRelay(): Plugin {
  return {
    name: "browser-console-relay",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__console", (req, res) => {
        if (req.method !== "POST") { res.end(); return; }
        let body = "";
        req.on("data", (chunk: Buffer) => { body += chunk; });
        req.on("end", () => {
          try {
            const { level, args } = JSON.parse(body);
            const tag = level === "log" ? "\x1b[36m[browser]\x1b[0m"
              : level === "warn" ? "\x1b[33m[browser:warn]\x1b[0m"
              : "\x1b[31m[browser:error]\x1b[0m";
            console.log(tag, ...args);
          } catch { /* ignore parse errors */ }
          res.end("ok");
        });
      });
    },
    transformIndexHtml() {
      return [{
        tag: "script",
        attrs: { type: "module" },
        children: `
(function() {
  const _log = console.log, _warn = console.warn, _err = console.error;
  function relay(level, args) {
    try {
      const safe = args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a));
      navigator.sendBeacon("/__console", JSON.stringify({ level, args: safe }));
    } catch {}
  }
  console.log = (...a) => { _log(...a); relay("log", a); };
  console.warn = (...a) => { _warn(...a); relay("warn", a); };
  console.error = (...a) => { _err(...a); relay("error", a); };
})();
`,
        injectTo: "head-prepend",
      }];
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    browserConsoleRelay(),
    react({
      plugins: [
        ["@swc/plugin-relay", {
          rootDir: __dirname,
          artifactDirectory: "./src/__generated__",
          language: "typescript",
          eagerEsModules: true,
        }],
      ],
    }),
    cloudflare(),
  ],
})
