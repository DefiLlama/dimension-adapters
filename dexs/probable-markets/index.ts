import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = `
    SELECT
      SUM(volume) as daily_volume
    FROM (
      SELECT
        CASE
          WHEN CAST(makerAssetId AS VARCHAR) = '0'
            THEN CAST(makerAmountFilled / 2 AS DOUBLE) / 1e18
          WHEN CAST(takerAssetId AS VARCHAR) = '0'
            THEN CAST(takerAmountFilled / 2 AS DOUBLE) / 1e18
        END AS volume
      FROM probable_v1_bnb.ctfexchange_evt_orderfilled
      WHERE evt_block_time >= from_unixtime(${options.startTimestamp})
        AND evt_block_time <= from_unixtime(${options.endTimestamp})
    )
  `;

  const result = await queryDuneSql(options, query);

  return {
    dailyVolume: result[0]?.daily_volume ?? 0,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.BSC],
  fetch,
  start: "2024-01-01",
  dependencies: [Dependencies.DUNE],
};

export default adapter;
