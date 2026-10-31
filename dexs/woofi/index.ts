import { Chain } from "../../adapters/types";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { httpGet } from "../../utils/fetchURL";

const apiNetworks: Record<Chain, string> = {
  [CHAIN.AVAX]: "avax",
  [CHAIN.BSC]: "bsc",
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.ARBITRUM]: "arbitrum",
  [CHAIN.OPTIMISM]: "optimism",
  [CHAIN.BASE]: "base",
  [CHAIN.SOLANA]: "solana",
  [CHAIN.HYPERLIQUID]: "hyperevm",
  [CHAIN.MONAD]: "monad",
  // Discontinued chains commented out in place to preserve history:
  // [CHAIN.FANTOM]: "fantom", // Discontinued support
  // [CHAIN.ERA]: "era", // Discontinued support
  // [CHAIN.POLYGON_ZKEVM]: "polygon_zkevm", // Discontinued support
  // [CHAIN.LINEA]: "linea", // Discontinued support
  // [CHAIN.MANTLE]: "mantle", // Discontinued support
  // [CHAIN.SONIC]: "sonic", // Discontinued support
  // [CHAIN.BERACHAIN]: "berachain", // Discontinued support
};

type TStartTime = {
  [l: string | Chain]: number;
}
const startTime: TStartTime = {
  [CHAIN.AVAX]: 1645228800,
  [CHAIN.BSC]: 1635206400,
  [CHAIN.POLYGON]: 1656028800,
  [CHAIN.ARBITRUM]: 1667520000,
  [CHAIN.OPTIMISM]: 1669161600,
  [CHAIN.BASE]: 1692057600,
  [CHAIN.SOLANA]: 1740528000,
  [CHAIN.HYPERLIQUID]: 1751328000,
  [CHAIN.MONAD]: 1764201600,
  // [CHAIN.FANTOM]: 1648080000, // Discontinued support
  // [CHAIN.ERA]: 1682553600, // Discontinued support
  // [CHAIN.POLYGON_ZKEVM]: 1687910400, // Discontinued support
  // [CHAIN.LINEA]: 1692748800, // Discontinued support
  // [CHAIN.MANTLE]: 1696464000, // Discontinued support
  // [CHAIN.SONIC]: 1735084800, // Discontinued support
  // [CHAIN.BERACHAIN]: 1738800000, // Discontinued support
};

const fetchApiVolume = async (options: FetchOptions) => {
  const apiURL = `https://api.woofi.com/stat?period=all&network=${apiNetworks[options.chain]}`;
  const response = await httpGet(apiURL);

  const startOfDayUTC = getTimestampAtStartOfDayUTC(options.toTimestamp);

  const rows = response?.data ?? [];
  const result = rows.find((item) => item.timestamp === startOfDayUTC.toString());

  if (!result) throw new Error(`woofi: no stat row for ${apiNetworks[options.chain]} at ${startOfDayUTC}`);

  const dailyVolume = Number(result.volume_usd) / 1e18;

  if (!dailyVolume) {
    const trailing = rows
      .filter((item: any) => Number(item.timestamp) < startOfDayUTC && Number(item.timestamp) >= startOfDayUTC - 7 * 86400)
      .map((item: any) => Number(item.volume_usd) / 1e18)
      .filter((value: number) => Number.isFinite(value))
      .sort((a: number, b: number) => a - b);
    const median = trailing.length ? trailing[Math.floor(trailing.length / 2)] : 0;
    if (median > 10000)
      throw new Error(`woofi: ${apiNetworks[options.chain]} reports 0 for ${options.dateString} against a 7 day median of ${Math.round(median)}, refusing a day the api has not finished`);
  }

  return { dailyVolume }
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
