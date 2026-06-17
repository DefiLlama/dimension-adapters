import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const fetch = async (options: FetchOptions) => {
  const data = await queryAllium(`
    SELECT
      SUM(usd_amount) AS daily_volume
    FROM solana.dex.trades
    WHERE project = 'phoenix'
      AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  return {
    dailyVolume: data[0]?.daily_volume ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-02-27',
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Trading volume from Phoenix orderbook fills on Solana, sourced from Allium's solana.dex.trades.",
  },
};

export default adapter;
