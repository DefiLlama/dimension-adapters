import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const DEX_TRADES_START = '2025-09-01'; //aggregator_swaps coverage incomplete from here

const newQuery = (options: FetchOptions) => `
  SELECT COALESCE(SUM(amount_usd), 0) AS volume_24
  FROM dex_solana.trades
  WHERE block_time >= from_unixtime(${options.startTimestamp})
    AND block_time <  from_unixtime(${options.endTimestamp})
    AND trade_source = 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4'
`;

const legacyQuery = (options: FetchOptions) => `
  SELECT sum(COALESCE(input_usd, output_usd)) as volume_24
  FROM jupiter_solana.aggregator_swaps
  WHERE block_time >= from_unixtime(${options.startTimestamp}) AND block_time < from_unixtime(${options.endTimestamp})
`;

const fetch = async (options: FetchOptions) => {
  const useDexTrades = options.dateString >= DEX_TRADES_START;
  if (useDexTrades) {
    const now = Date.now();
    const tenHoursAgo = now - 10 * 60 * 60 * 1000;
    if (options.toTimestamp * 1000 > tenHoursAgo) {
      throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
    }
  }
  const sql = useDexTrades ? newQuery(options) : legacyQuery(options);
  const data = await queryDuneSql(options, sql);

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return {
    dailyVolume: chainData.volume_24
  };
};

const adapter: any = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  start: '2023-04-16',
  methodology: {
    Volume:
      "Volume routed through the Jupiter aggregator on Solana. From 2025-09 sourced from dex_solana.trades (Jupiter v6 program), as jupiter_solana.aggregator_swaps has incomplete coverage from that point; earlier dates use jupiter_solana.aggregator_swaps.",
  },
  chains: [CHAIN.SOLANA],
};

export default adapter;
