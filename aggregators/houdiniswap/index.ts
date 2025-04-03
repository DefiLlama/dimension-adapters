import { httpGet } from "../../utils/fetchURL";
import { DOGE, CHAIN } from "../../helpers/chains";
import { FetchOptions } from "../../adapters/types";

const houdiniToDefiLlamaMap: Record<string, string> = {
  bitcoin: CHAIN.BITCOIN,
  ethereum: CHAIN.ETHEREUM,
  bsc: CHAIN.BSC,
  arbitrum: CHAIN.ARBITRUM,
  avalanche: CHAIN.AVAX,
  cardano: CHAIN.CARDANO,
  cronos: CHAIN.CRONOS,
  polygon: CHAIN.POLYGON,
  ripple: CHAIN.RIPPLE,
  solana: CHAIN.SOLANA,
  tron: CHAIN.TRON,
  fantom: CHAIN.FANTOM,
  litecoin: CHAIN.LITECOIN,
  base: CHAIN.BASE,
  optimism: CHAIN.OPTIMISM,
  celo: CHAIN.CELO,
  aurora: CHAIN.AURORA,
  moonbeam: CHAIN.MOONBEAM,
  moonriver: CHAIN.MOONRIVER,
  hedera: CHAIN.HEDERA,
  algorand: CHAIN.ALGORAND,
  telos: CHAIN.TELOS,
  thorchain: CHAIN.THORCHAIN,
  aptos: CHAIN.APTOS,
  phantasma: CHAIN.PHANTASMA,
  ton: CHAIN.TON,
  sui: CHAIN.SUI,
  icp: CHAIN.ICP,
  linea: CHAIN.LINEA,
  mantle: CHAIN.MANTLE,
  near: CHAIN.NEAR,
  scroll: CHAIN.SCROLL,
  taiko: CHAIN.TAIKO,
  zklink: CHAIN.ZKLINK,
  "zksync-era": CHAIN.ERA,
  sei: CHAIN.SEI,
  morph: CHAIN.MORPH,
  "bounce-bit": CHAIN.BOUNCE_BIT,
  gravity: CHAIN.GRAVITY,
  sonic: CHAIN.SONIC,
  hype: CHAIN.HYPERLIQUID,
  bera: CHAIN.BERACHAIN,
  "cosmoshub-4": CHAIN.COSMOS,
  doge: DOGE,
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `https://api.houdiniswap.com/api/aggregator-vol?startTimestamp=${options.startOfDay}&endTimestamp=${options.startOfDay}&chain=${options.chain}`;
  const res = await httpGet(url);
  const data = res[0];
  return {
    dailyVolume: data?.totalUSD,
  };
};

const adapter = {
  version: 1,
  adapter: Object.fromEntries(
    Object.keys(houdiniToDefiLlamaMap).map((chain) => [
      chain,
      {
        fetch,
        start: "2021-01-01",
      },
    ])
  ),
};

export default adapter;
