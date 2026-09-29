import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createMcpHandler, McpServer } from '@modelcontextprotocol/server';
import { toNodeHandler } from '@modelcontextprotocol/node';
import * as z from 'zod/v4';
import { createMemoryBackendFromEnv } from './memory-backend-factory.js';
import { MEMORY_TOOL_NAMES, createMemoryOperations, sanitizeMemoryError } from './memory-service.js';
import { runSemanticRestartProbe } from './semantic-restart-probe.js';

const defaultDatabasePath = fileURLToPath(new URL('./data/memory.sqlite', import.meta.url));
const memoryBackend = await createMemoryBackendFromEnv(process.env, { defaultDatabasePath });
const operations = createMemoryOperations(memoryBackend);
const configuredBackend = process.env.MEMORY_BACKEND === 'd1' ? 'cloudflare-d1' : 'sqlite-file';

function asToolResult(value) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value) }],
    structuredContent: value
  };
}

async function runOperation(name, args) {
  try {
    return asToolResult(await operations[name](args));
  } catch (error) {
    throw sanitizeMemoryError(error);
  }
}

const handler = createMcpHandler(() => {
  const server = new McpServer({ name: 'persistent-memory-mcp-spike', version: '0.0.5' });

  server.registerTool('memory_status', {
    title: 'Persistent Memory Status',
    description: 'Report writable memory backend status and append-only event count.',
    inputSchema: z.object({})
  }, async () => runOperation('memory_status', {}));

  server.registerTool('memory_create', {
    title: 'Create Test Memory',
    description: 'Create one immutable synthetic test memory.',
    inputSchema: z.object({
      id: z.string().min(1).max(100).optional(),
      scope: z.string().min(1).max(128).default('global'),
      kind: z.string().min(1).max(64).default('context'),
      content: z.string().min(1).max(4096)
    })
  }, async (args) => runOperation('memory_create', args));

  server.registerTool('memory_get', {
    title: 'Get Persistent Memory',
    description: 'Read the exact immutable memory item by id plus derived semantic state.',
    inputSchema: z.object({ id: z.string().min(1).max(100) })
  }, async (args) => runOperation('memory_get', args));

  server.registerTool('memory_search', {
    title: 'Search Persistent Memory',
    description: 'Literal case-insensitive search. Historical versions are hidden by default.',
    inputSchema: z.object({
      query: z.string().min(1).max(256),
      limit: z.number().int().min(1).max(20).default(5),
      includeHistory: z.boolean().default(false)
    })
  }, async (args) => runOperation('memory_search', args));

  server.registerTool('memory_revise', {
    title: 'Revise Persistent Memory',
    description: 'Create a new immutable memory version and append a revision relation.',
    inputSchema: z.object({
      id: z.string().min(1).max(100),
      content: z.string().min(1).max(4096),
      reason: z.string().min(1).max(1024).optional(),
      newId: z.string().min(1).max(100).optional()
    })
  }, async (args) => runOperation('memory_revise', args));

  server.registerTool('memory_confirm', {
    title: 'Confirm Persistent Memory',
    description: 'Append a non-destructive confirmation event to a memory.',
    inputSchema: z.object({
      id: z.string().min(1).max(100),
      note: z.string().min(1).max(1024).optional()
    })
  }, async (args) => runOperation('memory_confirm', args));

  server.registerTool('memory_supersede', {
    title: 'Supersede Persistent Memory',
    description: 'Link two existing current memories so the new one supersedes the old one.',
    inputSchema: z.object({
      oldId: z.string().min(1).max(100),
      newId: z.string().min(1).max(100),
      reason: z.string().min(1).max(1024).optional()
    })
  }, async (args) => runOperation('memory_supersede', args));

  server.registerTool('decision_record', {
    title: 'Record Durable Decision',
    description: 'Persist a decision together with rationale, alternatives, and optional context.',
    inputSchema: z.object({
      decision: z.string().min(1).max(4096),
      rationale: z.string().min(1).max(4096),
      alternatives: z.array(z.string().min(1).max(1024)).max(20).default([]),
      context: z.string().min(1).max(2048).optional(),
      scope: z.string().min(1).max(128).default('global'),
      id: z.string().min(1).max(100).optional()
    })
  }, async (args) => runOperation('decision_record', args));

  return server;
}, { responseMode: 'json' });

const nodeHandler = toNodeHandler(handler);
const port = Number(process.env.PORT || 3000);

function parseMcpResponse(raw) {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) return JSON.parse(trimmed);
  const dataLine = trimmed.split(/\r?\n/).find((line) => line.startsWith('data:'));
  if (!dataLine) throw new Error(`MCP returned unknown response: ${raw.slice(0, 200)}`);
  return JSON.parse(dataLine.slice('data:'.length).trim());
}

async function invokeMcp(id, method, params = {}) {
  const response = await handler.fetch(new Request('http://localhost/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params })
  }));
  const raw = await response.text();
  return { response, raw, payload: parseMcpResponse(raw) };
}

async function runMcpSelfTest() {
  const listed = await invokeMcp('startup-tools-list', 'tools/list');
  const tools = listed.payload?.result?.tools;
  if (!Array.isArray(tools)) throw new Error(`tools/list missing tools array: ${listed.raw.slice(0, 300)}`);

  const names = tools.map((tool) => tool?.name).sort();
  const expected = [...MEMORY_TOOL_NAMES].sort();
  const exact = JSON.stringify(names) === JSON.stringify(expected);
  console.log(`mcp-selftest-list ${JSON.stringify({ httpStatus: listed.response.status, tools: names, expected, exact })}`);
  if (!listed.response.ok || !exact) throw new Error(`MCP tools/list failed: status=${listed.response.status} tools=${JSON.stringify(names)}`);

  const statusCall = await invokeMcp('startup-status-call', 'tools/call', { name: 'memory_status', arguments: {} });
  const status = statusCall.payload?.result?.structuredContent;
  const backendOk = Boolean(
    (status?.memoryBackend === 'sqlite-file' && status?.persistence === 'file-backed' && status?.records >= 2) ||
    (status?.memoryBackend === 'cloudflare-d1' && status?.persistence === 'remote-durable' && status?.records >= 0)
  );
  const statusOk = Boolean(
    statusCall.response.ok && status?.ok === true &&
    status?.service === 'persistent-memory-mcp-spike' && status?.mode === 'read-write' &&
    status?.writable === true && Number.isInteger(status?.events) && backendOk
  );

  const probeId = 'teste-123';
  const probeContent = 'Persistent memory restart probe teste-123';
  const probeGetBeforeCall = await invokeMcp('startup-probe-get-before', 'tools/call', {
    name: 'memory_get', arguments: { id: probeId }
  });
  const probeBefore = probeGetBeforeCall.payload?.result?.structuredContent;
  const probePreexisting = Boolean(
    probeGetBeforeCall.response.ok && probeBefore?.found === true &&
    probeBefore?.item?.id === probeId && probeBefore?.item?.content === probeContent
  );

  let createOk = probePreexisting;
  if (!probePreexisting) {
    const createCall = await invokeMcp('startup-create-call', 'tools/call', {
      name: 'memory_create',
      arguments: { id: probeId, scope: 'spike:restart-proof', kind: 'test', content: probeContent }
    });
    const created = createCall.payload?.result?.structuredContent;
    createOk = Boolean(
      createCall.response.ok && created?.created === true &&
      created?.item?.id === probeId && created?.item?.content === probeContent
    );
  }

  const getCall = await invokeMcp('startup-get-call', 'tools/call', {
    name: 'memory_get', arguments: { id: probeId }
  });
  const got = getCall.payload?.result?.structuredContent;
  const getOk = Boolean(
    getCall.response.ok && got?.found === true &&
    got?.item?.id === probeId && got?.item?.content === probeContent
  );

  const searchCall = await invokeMcp('startup-search-call', 'tools/call', {
    name: 'memory_search', arguments: { query: probeId, limit: 5, includeHistory: false }
  });
  const searched = searchCall.payload?.result?.structuredContent;
  const searchOk = Boolean(
    searchCall.response.ok && searched?.count >= 1 &&
    searched?.items?.some((item) => item?.id === probeId && item?.content === probeContent)
  );

  console.log(`mcp-selftest-call ${JSON.stringify({
    status: statusOk,
    create: createOk,
    get: getOk,
    search: searchOk,
    probeId,
    probePreexisting,
    backend: status?.memoryBackend,
    recordsBeforeWrite: status?.records,
    eventsBeforeWrite: status?.events,
    writable: status?.writable,
    persistence: status?.persistence
  })}`);

  if (!statusOk || !createOk || !getOk || !searchOk) {
    throw new Error('MCP writable memory self-test failed');
  }

  if (status?.persistence === 'remote-durable') {
    let semanticCallSequence = 0;
    const semantic = await runSemanticRestartProbe(async (name, args) => {
      semanticCallSequence += 1;
      const call = await invokeMcp(`semantic-restart-${semanticCallSequence}`, 'tools/call', {
        name,
        arguments: args
      });
      const value = call.payload?.result?.structuredContent;
      if (!call.response.ok || !value) throw new Error('semantic_restart_probe_tool_failed');
      return value;
    });

    console.log(`mcp-semantic-restart-probe ${JSON.stringify({
      ok: semantic.ok,
      preexisting: semantic.preexisting,
      seeded: semantic.seeded,
      revision: semantic.revision,
      confirmation: semantic.confirmation,
      supersession: semantic.supersession,
      decision: semantic.decision,
      currentSearch: semantic.currentSearch,
      historySearch: semantic.historySearch,
      ids: semantic.ids,
      backend: status?.memoryBackend,
      persistence: status?.persistence
    })}`);

    if (!semantic.ok) throw new Error('MCP semantic restart probe failed');
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
      tools: MEMORY_TOOL_NAMES,
      backend: configuredBackend,
      mode: 'read-write'
    }));
    return;
  }
  void nodeHandler(req, res);
});

httpServer.listen(port, '0.0.0.0', async () => {
  console.log(`persistent-memory-mcp-spike listening on ${port}`);
  try { await runMcpSelfTest(); } catch (error) { console.error('mcp-selftest failed', error); }
});

async function shutdown() {
  await handler.close();
  await memoryBackend.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
