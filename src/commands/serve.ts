import http from "http";
import os from "os";
import qrcode from "qrcode-terminal";
import { produce } from "~/utils/produce";

export async function serve() {
	// Configuration
	const PORT = 8083;
	const HOST = "0.0.0.0"; // Listen on all network interfaces for LAN access

	const dump = await produce();
	const buffer = Buffer.from(dump, "utf8");

	const server = http.createServer((req, res) => {
		// Check if the request is for the root path
		// Check if file exists

		// Set headers for file download
		res.writeHead(200, {
			"Content-Type": "text/plain; charset=utf-8",
			"Content-Length": buffer.length,
			"Content-Disposition": `attachment; filename="chiaotu.yaml"`,
		});
		res.end(buffer);
	});

	server.listen(PORT, HOST, () => {
		const addr = `http://${getLocalIP()}:${PORT}`;
		console.log(`Server is running on LAN: ${addr}`);
		qrcode.generate(addr, { small: true });
	});
}

function getLocalIP() {
	const interfaces = os.networkInterfaces();
	for (const name of Object.keys(interfaces)) {
		if (!interfaces[name]) {
			continue;
		}
		for (const iface of interfaces[name]) {
			// Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
			if (iface.family === "IPv4" && !iface.internal) {
				return iface.address;
			}
		}
	}
	return "localhost";
}
