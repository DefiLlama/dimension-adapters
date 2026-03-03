import { FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const GALA_SWAP_API = "https://dex-backend-prod1.defi.gala.com/explore/pools?limit=20";

async function fetch(_: any, _2: any, _3: FetchOptions) {
  const { count } = (await fetchURL(`${GALA_SWAP_API}&page=1`)).data;
  const totalPages = Math.ceil(count / 20);
  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  const poolData = (await Promise.all(pages.map((page: number) =>
    fetchURL(`${GALA_SWAP_API}&page=${page}`)
  )));

  const data = poolData.flatMap(pages => pages.data.pools).reduce((acc: { volume: number, fees: number }, { fee24h, volume1d }: { fee24h: number, volume1d: number }) => {
    acc.fees += fee24h;
    acc.volume += volume1d;
    return acc;
  }, { volume: 0, fees: 0 });

  return {
    dailyVolume: data.volume,
    dailyFees: data.fees,
    dailyRevenue:0,
    dailySupplySideRevenue: data.fees,
    dailyProtocolRevenue: 0,
  }
}

const methodology = {
  Fees: "Swap fees paid by users",
  Revenue: "No revenue",
  Volume: "Galaswap trade volume",
  SupplySideRevenue: "All the fees goes to liquidity providers",
  ProtocolRevenue: "No protocol revenue",
};

export default {
  fetch,
  start: '2025-09-03',
  runAtCurrTime: true,
  chains: [CHAIN.GALA],
  methodology,
}