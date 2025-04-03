import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const houdiniToDefiLlamaMap: Record<string, string> = {
  bitcoin: CHAIN.BITCOIN,
  ethereum: CHAIN.ETHEREUM,
  bsc: CHAIN.BSC,
  arbitrum: CHAIN.ARBITRUM,
  avalanche: CHAIN.AVAX,
  cardano: CHAIN.CARDANO,
  // cronos: CHAIN.CRONOS,
  polygon: CHAIN.POLYGON,
  ripple: CHAIN.RIPPLE,
  solana: CHAIN.SOLANA,
  tron: CHAIN.TRON,
  // fantom: CHAIN.FANTOM,
  litecoin: CHAIN.LITECOIN,
  base: CHAIN.BASE,
  optimism: CHAIN.OPTIMISM,
  // celo: CHAIN.CELO,
  // aurora: CHAIN.AURORA,
  // moonbeam: CHAIN.MOONBEAM,
  // moonriver: CHAIN.MOONRIVER,
  // hedera: CHAIN.HEDERA,
  algorand: CHAIN.ALGORAND,
  // telos: CHAIN.TELOS,
  // thorchain: CHAIN.THORCHAIN,
  // aptos: CHAIN.APTOS,
  // phantasma: CHAIN.PHANTASMA,
  ton: CHAIN.TON,
  sui: CHAIN.SUI,
  icp: CHAIN.ICP,
  linea: CHAIN.LINEA,
  // mantle: CHAIN.MANTLE,
  // near: CHAIN.NEAR,
  // scroll: CHAIN.SCROLL,
  // taiko: CHAIN.TAIKO,
  // zklink: CHAIN.ZKLINK,
  // "zksync-era": CHAIN.ERA,
  // sei: CHAIN.SEI,
  // morph: CHAIN.MORPH,
  // "bounce-bit": CHAIN.BOUNCE_BIT,
  // gravity: CHAIN.GRAVITY,
  sonic: CHAIN.SONIC,
  // hype: CHAIN.HYPERLIQUID,
  // bera: CHAIN.BERACHAIN,
  // "cosmoshub-4": CHAIN.COSMOS,
};

const URL = "https://api.houdiniswap.com/api";
const endpoint = "/aggregator-vol?";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const startTimestamp = options.startOfDay;
  const endTimestamp = startTimestamp + 86400; // 24 hours in seconds
  
  // Find the Houdini chain key for the given DefiLlama chain
  const houdiniChain = Object.entries(houdiniToDefiLlamaMap).find(
    ([_, defiLlamaChain]) => defiLlamaChain === options.chain
  )?.[0] || options.chain;

  const url = `${URL}${endpoint}startTimestamp=${startTimestamp}&endTimestamp=${endTimestamp}&chain=${houdiniChain}`;
  try {
    const res = await httpGet(url);
    if (!res || !res.length) {
      return;
    }
    const targetDay = startTimestamp;
    const dailyData = res.find((item: any) => item.timestamp === targetDay);
    if (!dailyData) {
      return;
    }
    return {
      dailyVolume: dailyData.totalUSD.toString(),
      // totalVolume: dailyData.totalUSD.toString(),
      // timestamp: dailyData.timestamp,
    };
  } catch (error) {
    return;
  }
};

const adapter = {
  version: 1,
  adapter: Object.fromEntries(
    Object.entries(houdiniToDefiLlamaMap).map(([houdiniChain, defiLlamaChain]) => [
      defiLlamaChain,
      {
        fetch,
        start: 1609459200, // 2021-01-01
      },
    ])
  ),
};

export default adapter;
