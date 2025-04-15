import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

interface ChartData {
  date: string;
  txn_fee_usd: string;
}

const feesAPI = 'https://api.nearblocks.io/v1/charts';

const fetch = async (_timestamp: number, __: any, { dateString }: FetchOptions) => {

  const feesData = await httpGet(feesAPI);

  const fees = feesData.charts.find((chart: ChartData) =>
    chart.date.split('T')[0] === dateString
  )
  if (!fees) throw new Error(`No data found for date: ${dateString}`)

  return {
    dailyFees: fees.txn_fee_usd,
    dailyRevenue: fees.txn_fee_usd,
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
