import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const USDT = ADDRESSES.klaytn.USDT;

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const totalVolume = options.createBalances();

  // Provided Dune SQL query (do not edit)
  const query = `
    WITH FEE AS (
      SELECT
        evt_block_time AS date_,
        SUM(value) AS fee
      FROM erc20_kaia.evt_transfer
      WHERE
        contract_address = 0x5c13e303a62fc5dedf5b52d66873f2e59fedadc2
        AND to = 0x2994f8c9df255e3926f73ae892e7464b4f76cd49
      GROUP BY
        1
      ORDER BY
        1
    ),

    INFO AS (SELECT
      DATE(date_) as date_,
      SUM(fee) AS fee,
      SUM(
        CASE
          WHEN date_ < CAST('2024-10-22 05:00' AS TIMESTAMP)
          THEN fee / 0.001
          ELSE fee / 0.0007
        END
      ) AS dailyVolume
    FROM FEE
    GROUP BY
      1)
      
    SELECT 
        date_,
        dailyVolume,
        SUM(dailyVolume) OVER(ORDER BY date_ ASC) AS totalVolume
    FROM INFO
    ORDER BY date_ DESC;
`;

  const res = await queryDuneSql(options, query);
  const daily = res[0]?.dailyVolume || 0;
  const total = res[0]?.totalVolume || 0;
  dailyVolume.add(USDT, daily);
  totalVolume.add(USDT, total);

  return {
    dailyVolume,
    totalVolume,
  };
};

const methodology = {
  Volume: `
    The daily trading volume is calculated based on the fee paid, which is a specific percentage of trading volume, to the fee contract.
    The total volume is the sum of the daily volume.
    All volume is in USDT.
  `,
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: 1727684950, // timestamp of START_BLOCK 165682304
      meta: { methodology },
    },
  },
};

export default adapter;
