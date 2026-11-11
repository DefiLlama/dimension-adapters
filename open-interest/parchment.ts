import { PromisePool } from "@supercharge/promise-pool";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { graphqlCall } from "../helpers/sui";
import { PARCHMENT_USDC, getParchmentMarkets } from "../helpers/parchment";

// Every open position of a market has a record in the market's liquidation book (`liq.records`, a
// Table<u64 position_id, LiqRecord>) with its side, entry notional (USDC base units) and entry price (wad). The
// records of a side sum to the market's `sides.*_oi`.
async function getPositionRecords(tableId: string): Promise<any[]> {
  const records: any[] = [];
  let after: string | null = null;
  do {
    const data = await graphqlCall(`query ($table: SuiAddress!, $after: String) {
      address(address: $table) { dynamicFields(first: 50, after: $after) {
        pageInfo { hasNextPage endCursor } nodes { value { ... on MoveValue { json } } }
      } }
    }`, { table: tableId, after });
    const page = data?.address?.dynamicFields;
    if (!page) throw new Error(`Parchment: position records table ${tableId} not found`);
    for (const node of page.nodes) records.push(node.value.json);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  return records;
}

const fetch = async (options: FetchOptions) => {
  const openInterestAtEnd = options.createBalances();
  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();

  // Markets of the Parchment Exchange (see `getParchmentMarkets`), read with bounded concurrency; any failure is fatal.
  const markets = await getParchmentMarkets(options.endTimestamp);
  const { results } = await PromisePool.withConcurrency(5)
    .for(markets)
    .handleError((error) => { throw error; })
    .process(async ({ marketId, state }) => ({ marketId, state, records: await getPositionRecords(state.liq.records.id) }));

  for (const { marketId: market_id, state: market, records } of results) {
    const mark = BigInt(market.track.last_mark_wad);
    for (const record of records) {
      if (mark === 0n) throw new Error(`Parchment: open position on market ${market_id} without a mark price`);
      // Position size in base asset = notional / entry price; valued at the mark.
      const value = ((BigInt(record.notional) * mark) / BigInt(record.entry_wad)).toString();
      (record.is_long ? longOpenInterestAtEnd : shortOpenInterestAtEnd).add(PARCHMENT_USDC, value);
      openInterestAtEnd.add(PARCHMENT_USDC, value);
    }
  }

  return { openInterestAtEnd, longOpenInterestAtEnd, shortOpenInterestAtEnd };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // Market objects are read at their current version only, so history cannot be rebuilt.
  fetch,
  chains: [CHAIN.SUI],
  runAtCurrTime: true,
  methodology: {
    OpenInterest: "Sum over Parchment markets of long and short open positions, each position's size valued at its market's on-chain oracle mark price.",
  },
};

export default adapter;
