import { execFile } from "child_process";
import { promisify } from "util";
import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const execFileAsync = promisify(execFile);
const headers = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

async function fetchJson(url: string) {
  try {
    const { stdout } = await execFileAsync(
      "curl",
      ["-sS", "--fail", "-A", headers["User-Agent"], "-H", "Accept: application/json", url],
      { timeout: 30000, maxBuffer: 5 * 1024 * 1024, windowsHide: true },
    );
    return JSON.parse(stdout);
  } catch {
    return httpGet(url, { headers });
  }
}

const chainConfig: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.BITCOIN]: 'bitcoin',
  [CHAIN.BSC]: 'bsc',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.AVAX]: 'avalanche',
  [CHAIN.CARDANO]: 'cardano',
  [CHAIN.CRONOS]: 'cronos',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.SOLANA]: 'solana',
  [CHAIN.TRON]: 'tron',
  [CHAIN.FANTOM]: 'fantom',
  [CHAIN.LITECOIN]: 'litecoin',
  [CHAIN.BASE]: 'base',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.CELO]: 'celo',
  [CHAIN.AURORA]: 'aurora',
  [CHAIN.MOONBEAM]:'moonbeam',
  [CHAIN.MOONRIVER]:'moonriver',
  [CHAIN.HEDERA]:'hedera',
  [CHAIN.ALGORAND]:'algorand',
  [CHAIN.TELOS]:'telos',
  [CHAIN.THORCHAIN]:'thorchain',
  [CHAIN.APTOS]:'aptos',
  [CHAIN.PHANTASMA]:'phantasma',
  [CHAIN.TON]:'ton',
  [CHAIN.SUI]:'sui',
  [CHAIN.ICP]:'icp',
  [CHAIN.LINEA]:'linea',
  [CHAIN.MANTLE]:'mantle',
  [CHAIN.NEAR]:'near',
  [CHAIN.SCROLL]:'scroll',
  [CHAIN.TAIKO]:'taiko',
  [CHAIN.ZKLINK]:'zklink',
  // [CHAIN.ERA]: "zksync-era",
  // [CHAIN.SEI]:'sei',
  // [CHAIN.MORPH]:'morph',
  // [CHAIN.BOUNCE_BIT]: "bounce-bit",
  // [CHAIN.GRAVITY]:'gravity',
  [CHAIN.SONIC]:'sonic',
  [CHAIN.HYPERLIQUID]:'hype',
  [CHAIN.BERACHAIN]:'bera',
  [CHAIN.IOTAEVM]:'iota',
  [CHAIN.HEMI]:'hemi',
}

const URL = "https://api.houdiniswap.com/api/aggregator-vol?";

const fetch = async (options: FetchOptions) => {
  const startTimestamp = options.startOfDay;
  const endTimestamp = startTimestamp + 86400; // 24 hours in seconds

  // Find the Houdini chain key for the given DefiLlama chain
  const houdiniChain = chainConfig[options.chain];

  const url = `${URL}startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&chain=${houdiniChain}`;
  const defaultRes = {
    dailyVolume: 0,
  }
  const res = await fetchJson(url);
  const targetDay = startTimestamp;
  const dailyData = res.find((item: any) => item.timestamp === targetDay);
  if (!dailyData) {
    return defaultRes
  }
  let dailyVolume = dailyData.totalUSD;
  if ((options.chain == CHAIN.ARBITRUM) && (dailyVolume > 1000000)) {
    dailyVolume = 0
  }
  return {
    dailyVolume
  };
};

const adapter = {
  version: 1,
  start: '2021-01-01', // 2021-01-01
  fetch,
  chains: Object.keys(chainConfig)
};

export default adapter;