import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

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
}

const URL = "https://api.houdiniswap.com/api/aggregator-vol?";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startTimestamp = options.startOfDay;
  const endTimestamp = startTimestamp + 86400; // 24 hours in seconds

  // Find the Houdini chain key for the given DefiLlama chain
  const houdiniChain = chainConfig[options.chain];

  const url = `${URL}startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&chain=${houdiniChain}`;
  const defaultRes = {
    dailyVolume: 0,
  }
  const res = await fetchURL(url);
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
