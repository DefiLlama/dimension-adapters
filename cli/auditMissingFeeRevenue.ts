import { existsSync } from 'fs';
import { join, relative } from 'path';
import { parseArgs as parseNodeArgs } from 'util';

type Dimension =
  | 'dailyRevenue'
  | 'dailyProtocolRevenue'
  | 'dailyHoldersRevenue'
  | 'dailySupplySideRevenue'
  | 'dailyUserFees';

type ProtocolOverview = {
  name: string;
  displayName?: string;
  module: string;
  slug?: string;
  category?: string;
  chains?: string[];
  methodology?: Record<string, string>;
  total7d?: number;
};

type OverviewResponse = {
  protocols: ProtocolOverview[];
};

type AuditRow = {
  module: string;
  name: string;
  category: string;
  chains: string;
  fees7d: number;
  missing: Dimension[];
  methodologyKeys: string;
  localPath: string;
  url: string;
};

type CandidateRow = {
  protocol: ProtocolOverview;
  fees7d: number;
  missing: Dimension[];
};

type ParsedArgs = {
  dimensions: Dimension[];
  minFees: number;
  limit: number;
  format: 'table' | 'json' | 'csv';
};

const DEFAULT_DIMENSIONS: Dimension[] = ['dailyRevenue', 'dailyHoldersRevenue'];
const DIMENSIONS = new Set<Dimension>([
  'dailyRevenue',
  'dailyProtocolRevenue',
  'dailyHoldersRevenue',
  'dailySupplySideRevenue',
  'dailyUserFees',
]);

const API_URL = 'https://api.llama.fi/overview/fees';
const REQUEST_TIMEOUT_MS = 30_000;
let helperSourceMap: Map<string, string> | undefined;

function parseArgs(argv: string[]): ParsedArgs {
  const { values } = parseNodeArgs({
    args: argv.filter((arg) => arg !== '--'),
    options: {
      missing: { type: 'string' },
      'min-fees': { type: 'string' },
      limit: { type: 'string' },
      json: { type: 'boolean', default: false },
      csv: { type: 'boolean', default: false },
      help: { type: 'boolean', short: 'h', default: false },
    },
  });

  if (values.help) {
    printHelp();
    process.exit(0);
  }

  if (values.json && values.csv) {
    throw new Error('Use only one output format: --json or --csv');
  }

  const dimensions = values.missing
    ? values.missing.split(',').map((value) => value.trim()).filter(Boolean)
    : [...DEFAULT_DIMENSIONS];

  if (!dimensions.length) throw new Error('--missing requires at least one dimension');
  for (const dimension of dimensions) {
    if (!DIMENSIONS.has(dimension as Dimension)) {
      throw new Error(`Unknown dimension "${dimension}". Supported: ${Array.from(DIMENSIONS).join(', ')}`);
    }
  }

  const minFees = values['min-fees'] === undefined ? 0 : Number(values['min-fees']);
  if (!Number.isFinite(minFees) || minFees < 0) {
    throw new Error('--min-fees must be a non-negative number');
  }

  const limit = values.limit === undefined ? 50 : Number(values.limit);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('--limit must be a positive integer');
  }

  return {
    dimensions: dimensions as Dimension[],
    minFees,
    limit,
    format: values.json ? 'json' : values.csv ? 'csv' : 'table',
  };
}

function printHelp() {
  console.log(`Usage: pnpm run audit-missing-revenue -- [options]

Lists fee protocols with live dailyFees data that are absent from one or more
revenue-dimension overviews, sorted by last 7d fees.

Options:
  --missing=a,b   Dimensions to check. Default: dailyRevenue,dailyHoldersRevenue
                 Supported: ${Array.from(DIMENSIONS).join(', ')}
  --min-fees=N   Ignore protocols with dailyFees.total7d below N. Default: 0
  --limit=N      Maximum rows to print. Default: 50
  --json         Print JSON
  --csv          Print CSV
  --help         Show this help
`);
}

async function getOverview(dataType: string) {
  const url = new URL(API_URL);
  url.searchParams.set('excludeTotalDataChart', 'true');
  url.searchParams.set('excludeTotalDataChartBreakdown', 'true');
  url.searchParams.set('dataType', dataType);

  const response = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Failed ${dataType} overview: ${response.status} ${response.statusText}`);
  const data = await response.json() as OverviewResponse;
  if (!Array.isArray(data.protocols)) throw new Error(`Unexpected overview response for ${dataType}`);
  return data.protocols;
}

function findLocalPath(module: string) {
  const candidates = [
    join(process.cwd(), 'fees', module, 'index.ts'),
    join(process.cwd(), 'fees', `${module}.ts`),
    join(process.cwd(), 'fees', module, 'index.js'),
    join(process.cwd(), 'fees', `${module}.js`),
  ];

  const found = candidates.find((candidate) => existsSync(candidate));
  if (found) return relative(process.cwd(), found);

  const sourcePath = getHelperSourceMap().get(module);
  if (sourcePath) return sourcePath;
  return 'missing local file or unregistered helper';
}

function getHelperSourceMap() {
  if (helperSourceMap) return helperSourceMap;

  helperSourceMap = new Map();
  try {
    const { listHelperProtocols } = require('../factory/registry') as typeof import('../factory/registry');
    for (const protocol of listHelperProtocols('fees')) {
      let sourcePath = protocol.sourcePath;
      if (!sourcePath.startsWith('factory/') && !sourcePath.startsWith('helpers/') && sourcePath !== 'users/list.ts') {
        sourcePath = `helpers/${sourcePath}`;
      }
      if (protocol.exportName) sourcePath = `${sourcePath}#${protocol.exportName}`;
      helperSourceMap.set(protocol.protocolName, sourcePath);
    }
  } catch (error: any) {
    console.warn(`Warning: could not load factory registry (${error.message})`);
  }

  return helperSourceMap;
}

function buildCandidates(
  feesProtocols: ProtocolOverview[],
  dimensionSets: Map<Dimension, Set<string>>,
  dimensions: Dimension[],
  minFees: number,
) {
  return feesProtocols
    .map((protocol) => {
      const module = protocol.module;
      const missing = dimensions.filter((dimension) => !dimensionSets.get(dimension)?.has(module));
      return { protocol, missing, fees7d: Number(protocol.total7d ?? 0) };
    })
    .filter((row) => row.fees7d >= minFees && row.missing.length > 0)
    .sort((a, b) => b.fees7d - a.fees7d || a.protocol.module.localeCompare(b.protocol.module));
}

function toAuditRow({ protocol, missing, fees7d }: CandidateRow): AuditRow {
  const module = protocol.module;

  return {
    module,
    name: protocol.displayName ?? protocol.name,
    category: protocol.category ?? '-',
    chains: (protocol.chains ?? []).join(', ') || '-',
    fees7d,
    missing,
    methodologyKeys: Object.keys(protocol.methodology ?? {}).sort().join(', ') || '-',
    localPath: findLocalPath(module),
    url: protocol.slug ? `https://defillama.com/protocol/${protocol.slug}` : '',
  };
}

function printTable(rows: AuditRow[], totalCandidates: number) {
  const tableRows = rows.map((row) => ({
    module: row.module,
    name: row.name,
    fees7d: Math.round(row.fees7d),
    missing: row.missing.join(','),
    category: row.category,
    chains: row.chains,
    localPath: row.localPath,
  }));

  console.log(`Found ${totalCandidates} candidate fee adapters missing requested revenue dimensions.`);
  console.log('');
  console.table(tableRows);
}

function csvEscape(value: unknown) {
  const str = String(value ?? '');
  if (!/[",\n]/.test(str)) return str;
  return `"${str.replace(/"/g, '""')}"`;
}

function printCsv(rows: AuditRow[]) {
  const headers = ['module', 'name', 'fees7d', 'missing', 'category', 'chains', 'methodologyKeys', 'localPath', 'url'];
  console.log(headers.join(','));
  for (const row of rows) {
    console.log(headers.map((header) => {
      const value = header === 'missing' ? row.missing.join('|') : (row as any)[header];
      return csvEscape(value);
    }).join(','));
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const [feesProtocols, ...dimensionProtocols] = await Promise.all([
    getOverview('dailyFees'),
    ...args.dimensions.map((dimension) => getOverview(dimension)),
  ]);

  const dimensionSets = new Map<Dimension, Set<string>>();
  args.dimensions.forEach((dimension, index) => {
    dimensionSets.set(dimension, new Set(dimensionProtocols[index].map((protocol) => protocol.module)));
  });

  const candidates = buildCandidates(feesProtocols, dimensionSets, args.dimensions, args.minFees);
  const limitedRows = candidates.slice(0, args.limit).map(toAuditRow);

  if (args.format === 'json') {
    console.log(JSON.stringify({
      checkedDimensions: args.dimensions,
      minFees: args.minFees,
      totalCandidates: candidates.length,
      rows: limitedRows,
    }, null, 2));
  } else if (args.format === 'csv') {
    printCsv(limitedRows);
  } else {
    printTable(limitedRows, candidates.length);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error?.message ?? error);
  process.exit(1);
});
