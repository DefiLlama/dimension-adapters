// Movement version windows and indexer event reads
import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";
import { CHAIN } from "./chains";

const aptos = sdk.chains.aptos;

const INDEXER_TIMEOUT_MS = 60_000;
const INDEXER_RETRIES = 3;
const EVENTS_PAGE_SIZE = 100; // indexer silently caps limit at 100
const EVENTS_PAGE_COUNT_MAX = 1_000;

// account: handle owner, 0x0 for module events
export type MovementEvent = { version: number; index: number; type: string; account: string; data: any };

const EVENTS_QUERY = `query ($types: [String!]!, $from: bigint!, $to: bigint!, $offset: Int!, $limit: Int!) {
  events(
    where: { indexed_type: { _in: $types }, transaction_version: { _gt: $from, _lte: $to } }
    order_by: [{ transaction_version: asc }, { event_index: asc }]
    offset: $offset
    limit: $limit
  ) {
    transaction_version
    event_index
    indexed_type
    account_address
    data
  }
}`;

const EVENTS_PROCESSOR_QUERY = `query {
  processor_status(where: { processor: { _eq: "events_processor" } }) { last_success_version }
}`;

const indexerQuery = (query: string, variables: Record<string, any> = {}) =>
  aptos.indexerQuery({ chain: CHAIN.MOVE, query, variables, timeout: INDEXER_TIMEOUT_MS, retries: INDEXER_RETRIES });

// from - 1 so consecutive windows tile
export async function getVersionWindow(options: FetchOptions): Promise<{ fromVersion: number; toVersion: number }> {
  if (options.chain !== CHAIN.MOVE) throw new Error(`getVersionWindow supports ${CHAIN.MOVE} only, got ${options.chain}`);
  const fromVersion = await aptos.getVersionAtTimestamp({ chain: CHAIN.MOVE, timestamp: options.fromTimestamp - 1 });
  const toVersion = await aptos.getVersionAtTimestamp({ chain: CHAIN.MOVE, timestamp: options.toTimestamp });
  if (!Number.isSafeInteger(fromVersion) || !Number.isSafeInteger(toVersion)) throw new Error(`bad Movement versions ${fromVersion}..${toVersion}`);
  if (fromVersion > toVersion) throw new Error(`Movement version window inverted: ${fromVersion} > ${toVersion}`);
  return { fromVersion, toVersion };
}

export async function getModuleEvents({ types, fromVersion, toVersion }: { types: string[]; fromVersion: number; toVersion: number }): Promise<MovementEvent[]> {
  if (types.length === 0) throw new Error("getModuleEvents needs at least one event type");
  if (fromVersion > toVersion) throw new Error(`Movement version window inverted: ${fromVersion} > ${toVersion}`);

  const status = await indexerQuery(EVENTS_PROCESSOR_QUERY);
  const indexedVersion = Number(status?.processor_status?.[0]?.last_success_version);
  if (!Number.isSafeInteger(indexedVersion)) throw new Error(`Movement indexer events_processor status missing: ${JSON.stringify(status)}`);
  if (indexedVersion < toVersion) throw new Error(`Movement indexer events_processor at version ${indexedVersion}, window ends at ${toVersion}`);

  const events: MovementEvent[] = [];
  for (let page = 0; page < EVENTS_PAGE_COUNT_MAX; page++) {
    const result = await indexerQuery(EVENTS_QUERY, { types, from: fromVersion, to: toVersion, offset: page * EVENTS_PAGE_SIZE, limit: EVENTS_PAGE_SIZE });
    const rows = result?.events;
    if (!Array.isArray(rows)) throw new Error(`Movement indexer events query returned no rows array: ${JSON.stringify(result)}`);
    if (rows.length > EVENTS_PAGE_SIZE) throw new Error(`Movement indexer returned ${rows.length} rows for limit ${EVENTS_PAGE_SIZE}`);
    for (const row of rows) {
      events.push({ version: Number(row.transaction_version), index: Number(row.event_index), type: row.indexed_type, account: row.account_address, data: row.data });
    }
    if (rows.length < EVENTS_PAGE_SIZE) {
      assertOrderedWithin(events, fromVersion, toVersion);
      return events;
    }
  }
  throw new Error(`more than ${EVENTS_PAGE_COUNT_MAX * EVENTS_PAGE_SIZE} Movement events in versions (${fromVersion}, ${toVersion}]`);
}

function assertOrderedWithin(events: MovementEvent[], fromVersion: number, toVersion: number) {
  for (let i = 0; i < events.length; i++) {
    const { version, index } = events[i];
    if (!(version > fromVersion && version <= toVersion)) throw new Error(`Movement event version ${version} outside (${fromVersion}, ${toVersion}]`);
    if (i === 0) continue;
    const previous = events[i - 1];
    if (version < previous.version || (version === previous.version && index <= previous.index)) {
      throw new Error(`Movement events out of order at version ${version} index ${index}`);
    }
  }
}
