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
  if (data.volume?.USDC) { const v = Number(data.volume.USDC); if (Number.isFinite(v)) dailyBridgeVolume.addCGToken("usd-coin", v); }
  if (data.volume?.XLM) { const v = Number(data.volume.XLM); if (Number.isFinite(v)) dailyBridgeVolume.addCGToken("stellar", v); }
  if (data.fees?.USDC) { const v = Number(data.fees.USDC); if (Number.isFinite(v)) dailyFees.addCGToken("usd-coin", v); }
  if (data.fees?.XLM) { const v = Number(data.fees.XLM); if (Number.isFinite(v)) dailyFees.addCGToken("stellar", v); }
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