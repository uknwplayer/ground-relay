import { createServer } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';

const handler = createMcpHandler(() => {
  const server = new McpServer({
    name: 'persistent-memory-mcp-spike',
    version: '0.0.1'
  });

  server.registerTool(
    'memory_status',
    {
      title: 'Persistent Memory Status',
      description: 'Read-only spike tool that reports whether the remote MCP server is reachable. No persistent-memory backend is connected yet.',
      inputSchema: z.object({})
    },
    async () => {
      const status = {
        ok: true,
        service: 'persistent-memory-mcp-spike',
        mode: 'read-only',
        memoryBackend: 'not-connected',
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(status) }],
        structuredContent: status
      };
    }
  );

  return server;
}, { responseMode: 'json' });

const nodeHandler = toNodeHandler(handler);
const port = Number(process.env.PORT || 3000);

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'persistent-memory-mcp-spike' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, mcpEndpoint: '/mcp', tool: 'memory_status' }));
    return;
  }

  void nodeHandler(req, res);
});

httpServer.listen(port, '0.0.0.0', () => {
  console.log(`persistent-memory-mcp-spike listening on ${port}`);
});

async function shutdown() {
  await handler.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
