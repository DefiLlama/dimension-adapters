import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDuneSql } from "../../helpers/dune";

const USDT = ADDRESSES.klaytn.USDT;

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
        SUM(fee) AS fee
      FROM FEE
      GROUP BY
        1)
        
      SELECT 
          date_,
          fee,
          SUM(fee) OVER (ORDER BY date_ ASC) AS totalFees
      FROM INFO
      ORDER BY date_ DESC;
  `;

const fetch = async (options: FetchOptions) => {
  const res = await queryDuneSql(options, query);

  const dailyFeesAmount = res[0]?.fee || 0;
  const totalFeesAmount = res[0]?.totalFees || 0;

  const dailyFees = options.createBalances();
  dailyFees.add(USDT, dailyFeesAmount);

  const totalFees = options.createBalances();
  totalFees.add(USDT, totalFeesAmount);

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    totalFees,
  };
};

const methodology = {
  Fees: "Sum of fee transferred to the fee contract.",
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
