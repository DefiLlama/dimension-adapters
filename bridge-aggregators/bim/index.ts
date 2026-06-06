import { FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { fetchBungeeData } from "../../helpers/aggregators/bungee";
import { fetchBimChains } from "../../aggregators/bim/config";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const STELLAR_BRIDGE_URL = "https://defillama-data.bim.finance/bridge";

const fetchStellarBridge = async (options: FetchOptions) => {
  const { startTimestamp, endTimestamp } = options;
  const data = await fetchURL(`${STELLAR_BRIDGE_URL}?startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}`);
  const dailyBridgeVolume = options.createBalances();
  const dailyFees = options.createBalances();
  if (data.volume?.USDC) dailyBridgeVolume.addCGToken("usd-coin", Number(data.volume.USDC));
  if (data.volume?.XLM) dailyBridgeVolume.addCGToken("stellar", Number(data.volume.XLM));
  if (data.fees?.USDC) dailyFees.addCGToken("usd-coin", Number(data.fees.USDC));
  if (data.fees?.XLM) dailyFees.addCGToken("stellar", Number(data.fees.XLM));
  return { dailyBridgeVolume, dailyFees };
};

const fetch: any = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const { dailyBridgeVolume } = await fetchBungeeData(options, { bridgeVolume: true }, '2758')
  return {
    dailyBridgeVolume,
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
      fetch: fetchStellarBridge,
      start: '2026-04-19',
    },
  }
};

export default adapter;