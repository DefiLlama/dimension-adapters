import { Adapter, FetchResultFees, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

const endpoint = (year: number, month: number) => `https://api.frax.finance/v2/fpifpis/income-expense/detail?year=${year}&month=${month}`;
interface IFPI {
  timestampSec: number;
  type: string;
  chain: string;
  amountUsd: string;
  category: string;
}
const fetch = async (options: FetchOptions) => {
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(options.toTimestamp) - 1;
  const date = new Date((options.toTimestamp * 1000));
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const response: IFPI[]  = (await httpGet(endpoint(year, month)))?.details;
  const historical = response.filter((e:IFPI) => e.chain === 'ethereum');
  const dailyData = historical
    .filter((p: IFPI) => p.timestampSec >= options.startOfDay)
    .filter((p: IFPI) => p.timestampSec <= yesterdaysTimestamp)
  const dailyFees = dailyData.filter((p: IFPI) =>  p.type === 'income')
    .reduce((a: number, b: IFPI) => a + Number(b.amountUsd), 0);
  const dailyExpens = dailyData.filter((p: IFPI) =>  p.type === 'expense')
    .reduce((a: number, b: IFPI) => a + Number(b.amountUsd), 0);
  const dailyRevenue = dailyFees - dailyExpens;
  return {
    dailyFees,
    dailyProtocolRevenue: dailyRevenue,
    dailyRevenue,
  } as FetchResultFees;
}

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: '2022-05-31',
  allowNegativeValue: true, // High CPI Peg Costs, Temporary Losses, Operational or Arbitrage Costs, Yield Insufficiency
  methodology: {
    Fees: 'Fees paid by users.',
    Revenue: 'Revenue from fees, after expenses.',
    ProtocolRevenue: 'All revenue collected by Frax.',
  }
}

export default adapter;
