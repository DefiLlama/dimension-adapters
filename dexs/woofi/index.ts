import { Chain } from "../../adapters/types";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";

// every chain reads from the woofi stat api. the subgraphs behind the old
// per-chain endpoints are unreliable and they all shared one Promise.all, so a
// single failing one blanked the whole adapter. #8920 already moved mantle,
// hyperevm and solana here for the same reason.
const apiNetworks: Record<Chain, string> = {
  [CHAIN.AVAX]: "avax",
  [CHAIN.BSC]: "bsc",
  [CHAIN.FANTOM]: "fantom",
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.ARBITRUM]: "arbitrum",
  [CHAIN.OPTIMISM]: "optimism",
  [CHAIN.ERA]: "zksync",
  [CHAIN.POLYGON_ZKEVM]: "polygon_zkevm",
  [CHAIN.LINEA]: "linea",
  [CHAIN.BASE]: "base",
  [CHAIN.MANTLE]: "mantle",
  [CHAIN.SONIC]: "sonic",
  [CHAIN.BERACHAIN]: "berachain",
  [CHAIN.SOLANA]: "solana",
  [CHAIN.HYPERLIQUID]: "hyperevm",
  [CHAIN.MONAD]: "monad",
};

type TStartTime = {
  [l: string | Chain]: number;
}
const startTime: TStartTime = {
  [CHAIN.AVAX]: 1645228800,
  [CHAIN.BSC]: 1635206400,
  [CHAIN.FANTOM]: 1649808000,
  [CHAIN.POLYGON]: 1656028800,
  [CHAIN.ARBITRUM]: 1667520000,
  [CHAIN.OPTIMISM]: 1669161600,
  [CHAIN.ERA]: 1680652800,
  [CHAIN.POLYGON_ZKEVM]: 1688515200,
  [CHAIN.LINEA]: 1691625600,
  [CHAIN.BASE]: 1692057600,
  [CHAIN.MANTLE]: 1706659200,
  [CHAIN.SONIC]: 1734480000,
  [CHAIN.BERACHAIN]: 1742256000,
  [CHAIN.SOLANA]: 1740528000,
  [CHAIN.HYPERLIQUID]: 1751328000,
  [CHAIN.MONAD]: 1764201600,
};

const fetchApiVolume = async (options: FetchOptions) => {
  const apiURL = `https://api.woofi.com/stat?period=all&network=${apiNetworks[options.chain]}`;
  const response = await httpGet(apiURL);

  const startOfDayUTC = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const result = response?.data?.find((item) => item.timestamp === startOfDayUTC.toString());

  // a row carrying zero is a real quiet day and several chains have had those
  // for months. a missing row means the api has nothing for that day, so throw
  // rather than publish a zero that is not one.
  if (!result) throw new Error(`woofi: no stat row for ${apiNetworks[options.chain]} at ${startOfDayUTC}`);

  return {
    dailyVolume: Number(result.volume_usd) / 1e18,
  }
}

const volume = Object.keys(apiNetworks).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: fetchApiVolume,
      start: startTime[chain],
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  version: 1,
  adapter: volume,
};
export default adapter;
