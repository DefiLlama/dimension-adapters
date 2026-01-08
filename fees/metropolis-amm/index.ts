import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";


const fetch = async (_: number, _block: any, { startOfDayId }: FetchOptions) => {
  const query = `query { uniswapDayData(id: ${startOfDayId}) { dailyVolumeUSD } }`;
  const { data: { uniswapDayData: { dailyVolumeUSD } } } = await httpPost('https://sonic-graph-b.metropolis.exchange/subgraphs/name/metropolis/sonic-dex-1', { query })
  const dailyVolume = +dailyVolumeUSD
  const dailyFees = dailyVolume * 0.3/100
  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees * 0.6,
    dailyRevenue: dailyFees * 0.4,
    dailyProtocolRevenue: dailyFees * 0.1,
    dailyHoldersRevenue: dailyFees * 0.3,
  }
};

const methodology = {
  Fees: "0.3% of the trading volume",
  Revenue: "40% of the swap fees",
  ProtocolRevenue: "10% of the swap fees",
  SupplySideRevenue: "60% of the swap fees",
  HoldersRevenue: "30% of the swap fees",
};

export default {
  fetch,
  start: "2024-12-16",
  chains: [CHAIN.SONIC],
  methodology,
}
