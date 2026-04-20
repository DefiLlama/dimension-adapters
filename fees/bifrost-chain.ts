import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
let res: any;

const BURN_START_DATE = "2025-11-01";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
  const startTime = new Date(options.startTimestamp * 1000).toISOString().split("T")[0]
  if (!res)
    res = fetchURL('https://dapi.bifrost.io/api/dapp/stats/overview')
  const v = (await res).find((v: { date: string }) => v.date === startTime)

  if(!v) throw new Error(`No data returned from Bifrost for date ${options.dateString}`)

  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(+v.txFee);

  const dailyRevenue = options.dateString >= BURN_START_DATE ? dailyFees.clone(1 / 10) : options.createBalances();

  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
};


const adapter: any = {
  version: 1,
  chains: [CHAIN.BIFROST],
  fetch,
  start: '2024-11-08',
};

export default adapter;
