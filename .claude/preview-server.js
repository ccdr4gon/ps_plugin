// Minimal static file server for previewing the plugin UI in a browser.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();
const PORT = 5599;
const TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml"
};

http.createServer((req, res) => {
  let rel = decodeURIComponent(req.url.split("?")[0]);
  if (rel === "/") rel = "/index.html";
  const file = path.join(ROOT, rel);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "text/plain" });
    res.end(data);
  });
}).listen(PORT, () => console.log("Preview server on http://localhost:" + PORT));
