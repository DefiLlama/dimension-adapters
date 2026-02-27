import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";
import {httpGet} from "../../utils/fetchURL";

const fetch = async (_: number, _block: any, { startOfDayId, chain }: FetchOptions) => {
  const { volumeUSD, feesUSD } = await httpGet(`https://api.sectorone.xyz/api/v1/defilama/daily-stats/${chain}/${startOfDayId}`)

  const dailyVolume = +volumeUSD
  const dailyFees = +feesUSD
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees * 0.05,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees * 0.95,
    dailyHoldersRevenue: dailyFees * 0.05,
  }
};

// https://docs.sectorone.xyz/sectorone-dex/dlmm-pools
const methodology = {
  Fees: "Swap fees",
  Revenue: "5% of the swap fees",
  ProtocolRevenue: "0% of the swap fees",
  SupplySideRevenue: "95% of the swap fees",
  HoldersRevenue: "5% of the swap fees",
};

export default {
  fetch,
  start: "2026-02-04",
  chains: [CHAIN.MEGAETH],
  methodology,
}
