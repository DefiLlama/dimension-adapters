import { Adapter, ProtocolType } from "../adapters/types";
import { httpGet } from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

interface ChartData {
  date: string;
  txn_fee_usd: string;
}

const feesAPI = 'https://api.nearblocks.io/v1/charts';

const fetch = async (timestamp: number) => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const dateStr = new Date(todayTimestamp * 1000).toISOString().split('T')[0];

  const feesData = await httpGet(feesAPI);

  const dailyFees = feesData.charts.find((chart: ChartData) => 
    chart.date.split('T')[0] === dateStr
  )?.txn_fee_usd;

  return {
    dailyFees,
    dailyRevenue: dailyFees
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.NEAR]: {
      fetch,
      start: '2020-07-21',
      meta: {
        methodology: "We fetch daily transaction fees from NearBlocks API. The data is aggregated daily and includes all transaction fees paid on the NEAR blockchain. 70% of transaction fees are burned, while 30% can optionally be allocated to smart contract developers as rewards if they specify a fee percentage for their contracts (otherwise 100% is burned). Note that validators do not earn transaction fees - their rewards come from protocol-level inflation."
      }
    },
  },
  protocolType: ProtocolType.CHAIN
};

export default adapter;
