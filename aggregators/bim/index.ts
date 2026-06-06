import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { fetchBimChains } from "./config";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STELLAR_SWAP_URL = "https://defillama-data.bim.finance/swap";

const fetchStellarSwap = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const data = await fetchURL(`${STELLAR_SWAP_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`);
  console.log("Fetched Stellar Swap data:", data);
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  if (data.volume?.USDC) dailyVolume.addCGToken("usd-coin", Number(data.volume.USDC));
  if (data.volume?.XLM) dailyVolume.addCGToken("stellar", Number(data.volume.XLM));
  if (data.fees?.USDC) dailyFees.addCGToken("usd-coin", Number(data.fees.USDC));
  if (data.fees?.XLM) dailyFees.addCGToken("stellar", Number(data.fees.XLM));
  return { dailyVolume, dailyFees };
};

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyVolume } = await fetchBungeeData(options, { swapVolume: true }, '2758')
  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, //Bungee
  adapter: {
    ...fetchBimChains().reduce((acc, chain) => {
      return {
        ...acc,
        [chain]: {
          fetch,
          start: '2026-01-13',
        }
      }
    }, {}),
    [CHAIN.STELLAR]: {
      fetch: fetchStellarSwap,
      start: '2026-04-19',
    },
  }
};

export default adapter;
