import { createServer } from 'node:http';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { createDemoMemoryBackend } from './memory-backend.js';

const memoryBackend = createDemoMemoryBackend();

const handler = createMcpHandler(() => {
  const server = new McpServer({
    name: 'persistent-memory-mcp-spike',
    version: '0.0.1'
  });

  server.registerTool(
    'memory_status',
    {
      title: 'Persistent Memory Status',
      description: 'Report the status of the read-only SQLite demo memory backend.',
      inputSchema: z.object({})
    },
    async () => {
      const backendStatus = memoryBackend.status();
      const status = {
        ok: true,
        service: 'persistent-memory-mcp-spike',
        mode: 'read-only',
        memoryBackend: backendStatus.backend,
        records: backendStatus.records,
        writable: backendStatus.writable,
        persistence: backendStatus.persistence,
        timestamp: new Date().toISOString()
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(status) }],
        structuredContent: status
      };
    }
  );

  server.registerTool(
    'memory_get',
    {
      title: 'Get Persistent Memory',
      description: 'Read one synthetic demo memory by id. This tool never writes memory.',
      inputSchema: z.object({
        id: z.string().min(1).max(100)
      })
    },
    async ({ id }) => {
      const item = memoryBackend.get(id);
      const result = {
        found: item !== null,
        item
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result
      };
    }
  );

  server.registerTool(
    'memory_search',
    {
      title: 'Search Persistent Memory',
      description: 'Literal case-insensitive search over synthetic demo memories. This tool never writes memory.',
      inputSchema: z.object({
        query: z.string().min(1).max(256),
        limit: z.number().int().min(1).max(20).default(5)
      })
    },
    async ({ query, limit }) => {
      const items = memoryBackend.search(query, limit);
      const result = {
        query,
        count: items.length,
        items
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result
      };
    }
  );

  return server;
}, { responseMode: 'json' });

const nodeHandler = toNodeHandler(handler);
const port = Number(process.env.PORT || 3000);

function parseMcpResponse(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    return JSON.parse(trimmed);
  }

  const dataLine = trimmed
    .split(/\r?\n/)
    .find((line) => line.startsWith('data:'));

  if (!dataLine) {
    throw new Error(`MCP returned unknown response: ${raw.slice(0, 200)}`);
  }

  return JSON.parse(dataLine.slice('data:'.length).trim());
}

async function invokeMcp(id, method, params = {}) {
  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
  }));

  const raw = await response.text();
  return { response, raw, payload: parseMcpResponse(raw) };
}

async function runMcpSelfTest() {
  const listed = await invokeMcp('startup-tools-list', 'tools/list');
  const tools = listed.payload?.result?.tools;

  if (!Array.isArray(tools)) {
    throw new Error(`tools/list missing tools array: ${listed.raw.slice(0, 300)}`);
  }

  const names = tools.map((tool) => tool?.name).sort();
  const expected = ['memory_get', 'memory_search', 'memory_status'];
  const exact = JSON.stringify(names) === JSON.stringify(expected);
  console.log(`mcp-selftest-list ${JSON.stringify({ httpStatus: listed.response.status, tools: names, expected, exact })}`);

  if (!listed.response.ok || !exact) {
    throw new Error(`MCP tools/list failed: status=${listed.response.status} tools=${JSON.stringify(names)}`);
  }

  const statusCall = await invokeMcp('startup-status-call', 'tools/call', {
    name: 'memory_status',
    arguments: {}
  });
  const status = statusCall.payload?.result?.structuredContent;
  const statusOk = Boolean(
    statusCall.response.ok &&
    status?.ok === true &&
    status?.service === 'persistent-memory-mcp-spike' &&
    status?.mode === 'read-only' &&
    status?.memoryBackend === 'sqlite-demo' &&
    status?.records === 2 &&
    status?.writable === false
  );

  const getCall = await invokeMcp('startup-get-call', 'tools/call', {
    name: 'memory_get',
    arguments: { id: 'demo-001' }
  });
  const got = getCall.payload?.result?.structuredContent;
  const getOk = Boolean(
    getCall.response.ok &&
    got?.found === true &&
    got?.item?.id === 'demo-001' &&
    got?.item?.content === 'Blue widgets are stored in bin A.'
  );

  const searchCall = await invokeMcp('startup-search-call', 'tools/call', {
    name: 'memory_search',
    arguments: { query: 'metric', limit: 5 }
  });
  const searched = searchCall.payload?.result?.structuredContent;
  const searchOk = Boolean(
    searchCall.response.ok &&
    searched?.count === 1 &&
    searched?.items?.[0]?.id === 'demo-002'
  );

  console.log(`mcp-selftest-call ${JSON.stringify({
    status: statusOk,
    get: getOk,
    search: searchOk,
    backend: status?.memoryBackend,
    records: status?.records,
    writable: status?.writable
  })}`);

  if (!statusOk || !getOk || !searchOk) {
    throw new Error('MCP read-only memory self-test failed');
  }
}

const httpServer = createServer((req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'persistent-memory-mcp-spike' }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      mcpEndpoint: '/mcp',
      tools: ['memory_status', 'memory_get', 'memory_search'],
      backend: 'sqlite-demo',
      mode: 'read-only'
    }));
    return;
  }

  void nodeHandler(req, res);
});

httpServer.listen(port, '0.0.0.0', async () => {
  console.log(`persistent-memory-mcp-spike listening on ${port}`);
  try {
    await runMcpSelfTest();
  } catch (error) {
    console.error('mcp-selftest failed', error);
  }
});

async function shutdown() {
  await handler.close();
  memoryBackend.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
