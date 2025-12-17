import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

interface IChartItem {
  startTime: string;
  endTime: string;
  gasFeeOutBound: string;
  gasReimbursement: string;
  networkFee: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  // const feeEndpoint = `https://midgard.ninerealms.com/v2/history/reserve?interval=day&count=100`;
  const feeEndpoint = `https://midgard.ninerealms.com/v2/history/reserve?from=${options.startOfDay}&to=${options.endTimestamp}`;
  const historicalFees: IChartItem[] = (await httpGet(feeEndpoint, { headers: {"x-client-id": "defillama"}})).intervals;

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
