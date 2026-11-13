import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";
import { isCoreAsset } from "../../helpers/prices";

const NAVI_ROUTER_EVENT = '0x88dfe5e893bc9fa984d121e4d0d5b2e873dc70ae430cf5b3228ae6cb199cb32b::slippage::SwapEvent';
const MAX_INGESTION_GAP_SECONDS = 300;

// 0x000...0002::sui::SUI -> 0x2::sui::SUI, so framework coins match coreAssets.json
const shortCoinType = (t: string) => t.replace(/^0x0+(?=[0-9a-f]{1,4}::)/i, '0x');

function extractCoinTypes(typeString: string) {
  const match = typeString.match(/<([^,]+),\s*([^>]+)>/);
  if (!match) return null;
  return {
    coinIn: shortCoinType(match[1].trim()),
    coinOut: shortCoinType(match[2].trim())
  };
}

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const start = new Date(options.startTimestamp * 1000).toISOString();
  const end = new Date(options.endTimestamp * 1000).toISOString();

  // The coins only exist in the event's type parameters (SwapEvent<CoinIn, CoinOut>), the payload has
  // just the amounts, so read the type column too. queryEventsAllium returns parsed_json alone.
  const rows: { last_event: number, type: string | null, parsed_json: any }[] = await queryAllium(`
    WITH ingested AS (
      SELECT DATE_PART(epoch_second, MAX(checkpoint_timestamp)) AS last_event
      FROM sui.raw.events
      WHERE checkpoint_timestamp >= '${start}' AND checkpoint_timestamp < '${end}'
    ), swaps AS (
      SELECT type, parsed_json
      FROM sui.raw.events
      WHERE checkpoint_timestamp >= '${start}' AND checkpoint_timestamp < '${end}'
        AND type LIKE '${NAVI_ROUTER_EVENT}<%'
    )
    SELECT ingested.last_event, swaps.type, swaps.parsed_json
    FROM ingested LEFT JOIN swaps ON TRUE
  `);

  // quiet hours are real, so an empty window is only trusted once Allium has indexed up to its end
  const lastEvent = Number(rows[0]?.last_event);
  if (!lastEvent || lastEvent < options.endTimestamp - MAX_INGESTION_GAP_SECONDS)
    throw new Error(`navi: Allium sui.raw.events is incomplete for ${start} - ${end} (last event ${rows[0]?.last_event})`);

  for (const row of rows) {
    if (!row.type) continue;
    const coins = extractCoinTypes(row.type);
    const { amount_in, amount_out } = row.parsed_json ?? {};
    if (!coins || amount_in == null || amount_out == null)
      throw new Error(`navi: unparseable SwapEvent row ${row.type}`);

    // count each swap once, on the input coin unless only the output is a core asset
    const useInput = isCoreAsset(options.chain, coins.coinIn) || !isCoreAsset(options.chain, coins.coinOut);
    dailyVolume.add(useInput ? coins.coinIn : coins.coinOut, useInput ? amount_in : amount_out);
  }

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Swaps routed through NAVI's Astros aggregator on Sui, read from the router's SwapEvent and counted once, on the input coin unless only the output is a core asset.",
  },
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: "2024-10-05",
    },
  },
};

export default adapter;
