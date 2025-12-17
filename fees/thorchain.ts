import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface IChartItem {
  startTime: string;
  endTime: string;
  gasFeeOutBound: string;
  gasReimbursement: string;
  networkFee: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const feeEndpoint = `https://midgard.ninerealms.com/v2/history/reserve?interval=day&count=100`;
  // const feeEndpoint = `https://midgard.ninerealms.com/v2/history/reserve?interval=day&start=${options.startTimestamp}&to=${options.endTimestamp}&count=10`;
  console.log(feeEndpoint, options.startOfDay, options.endTimestamp);
  const historicalFees: IChartItem[] = (await fetchURL(feeEndpoint)).intervals;

  const dayData = historicalFees.find((feeItem: IChartItem) =>
    feeItem.startTime === String(options.startOfDay) && feeItem.endTime === String(options.endTimestamp)
  );

  if (!dayData) {
    throw new Error(`No chain fees data found for ${options.dateString}`);
  }
  const dailyFees = options.createBalances();

  dailyFees.addCGToken('thorchain', Number(dayData.networkFee) / 1e8);

  return { dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.THORCHAIN],
  start: "2021-04-01",
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
