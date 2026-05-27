import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
const DEX_TRADES_START = 1756684800; // 2025-09-01, aggregator_swaps coverage incomplete from here

const newQuery = (options: FetchOptions) => `
  SELECT SUM(amount_usd) AS volume_24
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
  const sql = options.startOfDay >= DEX_TRADES_START ? newQuery(options) : legacyQuery(options);
  const data = await queryDuneSql(options, sql);

  const chainData = data[0];
  if (!chainData) throw new Error(`Dune query failed: ${JSON.stringify(data)}`);
  return {
    dailyVolume: chainData.volume_24
  };
};

const adapter: any = {
  version: 2,
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
