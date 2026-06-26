interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * Tours Métropole Open Data (data.tours-metropole.fr) — OpenDataSoft MCP.
 *
 * Tours Métropole Open Data — open data for Tours Métropole, France via the OpenDataSoft Explore v2.1 API: mobility, urban services & environment. Keyless.
 * Use `search_datasets` (find a dataset_id) -> `dataset_info` (schema) -> `query` (ODSQL records).
 */


const BASE = 'https://data.tours-metropole.fr';
const UA = 'pipeworx-mcp-data-tours/1.0 (+https://pipeworx.io)';

const tools: McpToolExport['tools'] = [
  {
    name: 'search_datasets',
    description: 'Search Tours Métropole Open Data for datasets by keyword (mobility, urban services & environment). Returns dataset_ids (pass to query/dataset_info), titles, themes and record counts.',
    inputSchema: { type: 'object', properties: {
      query: { type: 'string', description: 'Keyword(s) to search dataset titles/descriptions.' },
      limit: { type: 'number', description: 'Max datasets (1-100, default 20).' },
      offset: { type: 'number', description: 'Pagination offset (default 0).' },
    } },
  },
  {
    name: 'dataset_info',
    description: 'Get metadata for one Tours Métropole Open Data dataset (fields/schema, themes, record count) — call before query to learn the column names.',
    inputSchema: { type: 'object', properties: {
      dataset_id: { type: 'string', description: 'Dataset id from search_datasets.' },
    }, required: ['dataset_id'] },
  },
  {
    name: 'query',
    description: 'Query records from a Tours Métropole Open Data dataset with ODSQL. Filter (where), aggregate (group_by/select), sort (order_by), paginate (limit/offset).',
    inputSchema: { type: 'object', properties: {
      dataset_id: { type: 'string', description: 'Dataset id from search_datasets.' },
      query: { type: 'string', description: 'Free-text keyword across all fields (optional).' },
      where: { type: 'string', description: 'ODSQL filter, e.g. `year >= 2020 AND city = "Paris"` (overrides query).' },
      select: { type: 'string', description: 'ODSQL select/aggregation, e.g. `count(*) as n, sum(amount)`.' },
      group_by: { type: 'string', description: 'ODSQL group_by field(s).' },
      order_by: { type: 'string', description: 'Sort, e.g. `date desc`.' },
      limit: { type: 'number', description: 'Max records (1-100, default 20).' },
      offset: { type: 'number', description: 'Pagination offset (default 0).' },
    }, required: ['dataset_id'] },
  },
];

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'search_datasets': {
      const p = new URLSearchParams();
      if (args.query) p.set('where', `search(*, "${esc(String(args.query))}")`);
      p.set('limit', String(clamp(numArg(args.limit, 20), 1, 100)));
      p.set('offset', String(Math.max(0, numArg(args.offset, 0))));
      return get(`/api/explore/v2.1/catalog/datasets?${p}`);
    }
    case 'dataset_info':
      return get(`/api/explore/v2.1/catalog/datasets/${encodeURIComponent(reqStr(args, 'dataset_id', '"<id>"'))}`);
    case 'query': {
      const id = reqStr(args, 'dataset_id', '"<id>"');
      const p = new URLSearchParams();
      if (args.where) p.set('where', String(args.where));
      else if (args.query) p.set('where', `search(*, "${esc(String(args.query))}")`);
      if (args.select) p.set('select', String(args.select));
      if (args.group_by) p.set('group_by', String(args.group_by));
      if (args.order_by) p.set('order_by', String(args.order_by));
      p.set('limit', String(clamp(numArg(args.limit, 20), 1, 100)));
      p.set('offset', String(Math.max(0, numArg(args.offset, 0))));
      return get(`/api/explore/v2.1/catalog/datasets/${encodeURIComponent(id)}/records?${p}`);
    }
    default: throw new Error(`Unknown tool: ${name}`);
  }
}

async function get(path: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json', 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Tours Métropole Open Data: ${res.status} ${await res.text().then((t) => t.slice(0, 160))}`);
  return res.json();
}
function esc(s: string): string { return s.replace(/"/g, '\\"'); }
function reqStr(args: Record<string, unknown>, k: string, ex: string): string { const v = args[k]; if (typeof v !== 'string' || !v.trim()) throw new Error(`Required argument "${k}" is missing. Pass a string like ${ex} (from search_datasets).`); return v; }
function numArg(v: unknown, d: number): number { const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN; return Number.isFinite(n) ? n : d; }
function clamp(n: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, Math.trunc(n))); }

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
