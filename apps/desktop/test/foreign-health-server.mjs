import http from "node:http";

const port = Number.parseInt(process.argv[2] ?? "8787", 10);

const server = http.createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ ok: true, service: "foreign-service" }));
    return;
  }

  response.writeHead(404, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify({ ok: false }));
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`ready:${port}\n`);
});

const close = () => server.close(() => process.exit(0));
process.on("SIGINT", close);
process.on("SIGTERM", close);
