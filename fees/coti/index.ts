import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const STATS_API = "https://coti-mainnet.cloud.blockscout.com/stats-service/api/v1/lines/txnsFee?resolution=DAY";

interface ICotiStats {
  date: string;
  value: string;
  is_approximate?: boolean;
}

const fetch = async(_a:  any, _b: any, options: FetchOptions) => {
  const dateString = new Date(options.startOfDay * 1000)
    .toISOString()
    .split("T")[0];

  const response = await httpGet(STATS_API);
  const dailyFees = options.createBalances();

  const dayData = response.chart.find(
    (d: ICotiStats) => d.date === dateString
  );

  // Skip approximate (partial) days — DefiLlama best practice
  if (dayData && !dayData.is_approximate) {
    dailyFees.addCGToken("coti", Number(dayData.value));
  } else {
    throw Error(`Fees data not found for chain coti on ${dateString}`)
  }

  return { dailyFees };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.COTI]: {
      fetch,
      start: "2025-03-24",
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
