import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";

type DimentionResult = {
  dailyVolume?: number;
  dailyFees?: number;
  dailyUserFees?: number;
  dailyRevenue?: number;
  openInterestAtEnd?: number;
};


async function fetch(_a: any, _b: any, options: FetchOptions): Promise<DimentionResult> {
  const sql = getSqlFromFile('helpers/queries/drift-protocol.sql', {
    start: options.startTimestamp,
    end: options.endTimestamp
  });
  const data = await queryDuneSql(options, sql);

  const dailyVolume = Number(Number(data[0]?.perpetual_volume || 0).toFixed(0))
  const dailyFees = Number(Number(data[0]?.total_taker_fee || 0).toFixed(0))
  const dailyRevenue = Number(Number(data[0]?.total_revenue || 0).toFixed(0))

  return { dailyVolume, dailyFees, dailyRevenue, openInterestAtEnd: data[0]?.openInterestAtEnd };
}

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SOLANA],
  start: '2023-07-25',
  fetch,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
};

export default adapter;
