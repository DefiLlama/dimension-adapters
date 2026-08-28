import { FetchOptions, FetchResultFees, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const startDate = options.dateString;
  const endDate = new Date((options.startOfDay + 24 * 60 * 60) * 1000).toISOString().split("T")[0];
  const res: {fees: number, time: string}[] = (await httpPost('https://api.ox.fun/v2/accvalue/public/corporate/earn/fees', {
    endDate,
    startDate
  })).data;
  const fees = res.find((item) => item.time === startDate)?.fees;
  
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('ox-fun', fees ? Number(fees) : undefined);
  
  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2024-01-18',
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
  