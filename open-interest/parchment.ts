import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { graphqlCall } from "../helpers/sui";
import { PARCHMENT_EXCHANGE, PARCHMENT_START, PARCHMENT_USDC, getParchmentEvents, getVersionedState } from "../helpers/parchment";

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

  // Markets are discovered from their creation events and kept only if they belong to the Parchment Exchange.
  const created = await getParchmentEvents("CreateMarketEventV1", Date.parse(PARCHMENT_START) / 1e3, options.endTimestamp);
  for (const { market_id } of created) {
    const market = await getVersionedState(market_id);
    if (market.exchange_id !== PARCHMENT_EXCHANGE) continue;
    const mark = BigInt(market.track.last_mark_wad);
    for (const record of await getPositionRecords(market.liq.records.id)) {
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
