import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import { httpPost } from "../../utils/fetchURL";

const fetch = async (_: number, _block: any, { startOfDayId }: FetchOptions) => {
  const query = `query { traderJoeDayData(id: ${startOfDayId}) { volumeUSD feesUSD } }`;
  const { data: { traderJoeDayData: { volumeUSD, feesUSD } } } = await httpPost('https://sonic-graph-b.metropolis.exchange/subgraphs/name/metropolis/sonic-lb-v22-2-w-v', { query })
  const dailyVolume = +volumeUSD
  const dailyFees = +feesUSD
  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees * 0.8,
    dailyRevenue: dailyFees * 0.2,
    dailyProtocolRevenue: dailyFees * 0.05,
    dailyHoldersRevenue: dailyFees * 0.15,
  }
};

// https://docs.metropolis.exchange/protocol/or-pools-and-farms/or-dlmm-lb
const methodology = {
  Fees: "Swap fees",
  Revenue: "20% of the swap fees",
  ProtocolRevenue: "5% of the swap fees",
  SupplySideRevenue: "80% of the swap fees",
  HoldersRevenue: "15% of the swap fees",
};

export default {
  fetch,
  start: "2024-12-16",
  chains: [CHAIN.SONIC],
  methodology,
}
