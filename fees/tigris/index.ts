import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (_: any, _1: any, { dateString }: FetchOptions) => {
  const { data: { fees } } = await httpGet('https://subgraph.tigris.trade/api/platform')
  const feeData = fees.find((e: any) => e.date === dateString)
  if (!feeData) throw new Error('No data found for the given date');

  return {
    dailyFees: feeData.feesUSDFormatted,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-09-13',
    },
  }
}

export default adapter;
