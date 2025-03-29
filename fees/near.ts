import type { FetchOptions } from "../adapters/types";
import { Adapter, ProtocolType } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

interface ChartData {
  date: string;
  txn_fee: string;
}

const feesAPI = 'https://nearblocks.io/_next/data/nearblocks/en/charts/txn-fee.json';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.startTimestamp) * 1000;
  const startDate = new Date(todaysTimestamp).toISOString();

  const feesData = await httpGet(feesAPI);

  const matchingDay = feesData.pageProps.data.charts.find((chart: ChartData) => 
    chart.date === startDate
  );

  const tokenAmount: number = matchingDay ? Number(matchingDay.txn_fee) : 0;
  const finalDailyFee: number = tokenAmount / 1e24;

  const dailyFees = options.createBalances();
  dailyFees.addCGToken('near', finalDailyFee);

  return {
    dailyFees
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.NEAR]: {
      fetch,
      start: '2020-07-21',
      meta: {
        methodology: "We fetch daily transaction fees from NearBlocks API. The data is aggregated daily and includes all transaction fees paid on the NEAR blockchain."
      }
    },
  },
  protocolType: ProtocolType.CHAIN
};

export default adapter;
