import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const GALA_SWAP_API = "https://dex-backend-prod1.defi.gala.com";
const V2_START = "2026-10-07";

async function fetchV1Day(dateString: string) {
  const { volumeUSD, feesUSD } = await fetchURL(`${GALA_SWAP_API}/dex/pairs/volume-fees?date=${dateString}`);
  if (typeof volumeUSD !== "number" || typeof feesUSD !== "number")
    throw new Error(`galaswap: no daily volume and fees for ${dateString}`);
  return { volume: volumeUSD, fees: feesUSD, protocolFees: 0 };
}

async function fetchV2Snapshot() {
  const totals = { volume: 0, fees: 0, protocolFees: 0 };
  for (let page = 1; ; page++) {
    const { data: pools } = await fetchURL(`${GALA_SWAP_API}/v2/trade/pools?limit=50&page=${page}`);
    for (const { volume1d, fee, protocolFees } of pools) {
      const grossFees = Number(volume1d) * Number(fee) / 1e6;
      totals.volume += Number(volume1d);
      totals.fees += grossFees;
      totals.protocolFees += grossFees * Number(protocolFees);
    }
    if (pools.length < 50) break;
  }
  return totals;
}

async function fetch(options: FetchOptions) {
  const v1 = await fetchV1Day(options.dateString);
  let { volume, fees, protocolFees } = v1;

  if (options.dateString >= V2_START) {
    if (Date.now() / 1000 - options.endTimestamp > 24 * 60 * 60)
      throw new Error(`galaswap: v2 pools only expose a rolling 24h snapshot, so ${options.dateString} cannot be refilled`);
    const v2 = await fetchV2Snapshot();
    volume += v2.volume;
    fees += v2.fees;
    protocolFees += v2.protocolFees;
  }

  return {
    dailyVolume: volume,
    dailyFees: fees,
    dailyRevenue: protocolFees,
    dailySupplySideRevenue: fees - protocolFees,
    dailyProtocolRevenue: protocolFees,
  }
}

const methodology = {
  Fees: "Swap fees paid by users",
  Revenue: "Share of v2 pool swap fees kept by the protocol",
  Volume: "Galaswap trade volume",
  SupplySideRevenue: "Swap fees that go to liquidity providers",
  ProtocolRevenue: "Share of v2 pool swap fees kept by the protocol",
};

export default {
  version: 1,
  fetch,
  start: '2025-09-03',
  chains: [CHAIN.GALA],
  methodology,
}
