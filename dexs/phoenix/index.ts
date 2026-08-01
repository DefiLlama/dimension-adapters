import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const fetch = async (options: FetchOptions) => {
  const data = await queryAllium(`
    SELECT
      COALESCE(SUM(usd_amount), 0) AS daily_volume
    FROM solana.dex.trades
    WHERE project = 'phoenix'
      AND block_timestamp >= TO_TIMESTAMP_NTZ('${options.startTimestamp}')
      AND block_timestamp < TO_TIMESTAMP_NTZ('${options.endTimestamp}')
  `);

  return {
    dailyVolume: data[0].daily_volume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
