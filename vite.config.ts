import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: {
			"~": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:8080",
				changeOrigin: true,
			},
			// The auth page validates its token against the (now authenticated)
			// healthz endpoint, which lives outside the /api prefix.
			"/healthz": {
				target: "http://localhost:8080",
				changeOrigin: true,
			},
		},
	},
});
