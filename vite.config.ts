// TanStack Start Vite configuration for CrediAdapt AI
// Includes TanStack devtools, tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro, and @ path aliases.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  // This app is hosted as a long-running Node process (not a Cloudflare Worker).
  // The default Lovable preset produces a Worker module that exits when run with
  // `node`, whereas node-server emits an HTTP listener for systemd/Nginx.
  nitro: { preset: "node-server" },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
