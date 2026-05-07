import { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

type ChainConfig = {
  chain: string;
  baseUrl: string;
  version: 1 | 2;
};

const blockscoutStatsChains: Record<string, ChainConfig> = {
  ancient8: { chain: CHAIN.ANCIENT8, baseUrl: "https://explorer-ancient8-mainnet-0.t.conduit.xyz", version: 1 },
  astar: { chain: CHAIN.ASTAR, baseUrl: "https://astar.blockscout.com", version: 2 },
  aurora: { chain: CHAIN.AURORA, baseUrl: "https://aurorascan.dev", version: 2 },
  bob: { chain: CHAIN.BOB, baseUrl: "https://explorer-bob-mainnet-0.t.conduit.xyz", version: 1 },
  celo: { chain: CHAIN.CELO, baseUrl: "https://celo.blockscout.com", version: 2 },
  corn: { chain: CHAIN.CORN, baseUrl: "https://explorer-corn-maizenet.t.conduit.xyz", version: 1 },
  coti: { chain: CHAIN.COTI, baseUrl: "https://mainnet.cotiscan.io", version: 2 },
  cross: { chain: CHAIN.CROSS, baseUrl: "https://www.crossscan.io", version: 2 },
  earnm: { chain: CHAIN.EARNM, baseUrl: "https://earnm-mainnet.explorer.alchemy.com", version: 2 },
  endurance: { chain: CHAIN.ENDURANCE, baseUrl: "https://explorer-endurance.fusionist.io", version: 2 },
  energyweb: { chain: CHAIN.ENERGYWEB, baseUrl: "https://explorer.energyweb.org", version: 2 },
  ethereumclassic: { chain: CHAIN.ETHEREUM_CLASSIC, baseUrl: "https://etc.blockscout.com", version: 2 },
  etherlink: { chain: CHAIN.ETHERLINK, baseUrl: "https://explorer.etherlink.com", version: 2 },
  eventum: { chain: CHAIN.EVENTUM, baseUrl: "https://explorer.evedex.com", version: 2 },
  everclear: { chain: CHAIN.EVERCLEAR, baseUrl: "https://scan.everclear.org", version: 2 },
  filecoin: { chain: CHAIN.FILECOIN, baseUrl: "https://filecoin.blockscout.com", version: 2 },
  fuse: { chain: CHAIN.FUSE, baseUrl: "https://explorer.fuse.io", version: 2 },
  hemi: { chain: CHAIN.HEMI, baseUrl: "https://explorer.hemi.xyz", version: 1 },
  "hashkey chain": { chain: CHAIN.HASHKEY, baseUrl: "https://hashkey.blockscout.com", version: 2 },
  "immutable zkevm": { chain: CHAIN.IMX, baseUrl: "https://explorer.immutable.com", version: 2 },
  ink: { chain: CHAIN.INK, baseUrl: "https://explorer.inkonchain.com", version: 2 },
  "iota evm": { chain: CHAIN.IOTAEVM, baseUrl: "https://explorer.evm.iota.org", version: 2 },
  lightlink: { chain: CHAIN.LIGHTLINK_PHOENIX, baseUrl: "https://phoenix.lightlink.io", version: 2 },
  lisk: { chain: CHAIN.LISK, baseUrl: "https://blockscout.lisk.com", version: 2 },
  mantle: { chain: CHAIN.MANTLE, baseUrl: "https://mantle-blockscout-stats.mantle.xyz", version: 1 },
  matchain: { chain: CHAIN.MATCHAIN, baseUrl: "https://matchscan.io", version: 2 },
  mode: { chain: CHAIN.MODE, baseUrl: "https://explorer.mode.network", version: 2 },
  neon: { chain: CHAIN.NEON, baseUrl: "https://neon.blockscout.com", version: 2 },
  "edu chain": { chain: CHAIN.EDU_CHAIN, baseUrl: "https://educhain.blockscout.com", version: 2 },
  prom: { chain: CHAIN.PROM, baseUrl: "https://promscan.io", version: 2 },
  redstone: { chain: CHAIN.REDSTONE, baseUrl: "https://explorer.redstone.xyz", version: 2 },
  reyachain: { chain: CHAIN.REYA, baseUrl: "https://explorer.reya.network", version: 2 },
  rsk: { chain: CHAIN.ROOTSTOCK, baseUrl: "https://rootstock.blockscout.com", version: 2 },
  shape: { chain: CHAIN.SHAPE, baseUrl: "https://shapescan.xyz", version: 2 },
  shimmerevm: { chain: CHAIN.SHIMMER_EVM, baseUrl: "https://explorer.evm.shimmer.network", version: 2 },
  soneium: { chain: CHAIN.SONEIUM, baseUrl: "https://soneium.blockscout.com", version: 2 },
  superposition: { chain: CHAIN.SUPERPOSITION, baseUrl: "https://explorer-superposition-1v9rjalnat.t.conduit.xyz", version: 1 },
  story: { chain: CHAIN.STORY, baseUrl: "https://www.storyscan.io", version: 2 },
  swellchain: { chain: CHAIN.SWELLCHAIN, baseUrl: "https://explorer.swellnetwork.io", version: 1 },
  syndicate: { chain: CHAIN.SYNDICATE, baseUrl: "https://explorer.syndicate.io", version: 2 },
  tac: { chain: CHAIN.TAC, baseUrl: "https://explorer.tac.build", version: 2 },
  unichain: { chain: CHAIN.UNICHAIN, baseUrl: "https://unichain.blockscout.com", version: 2 },
  "world chain": { chain: CHAIN.WC, baseUrl: "https://worldchain-mainnet.explorer.alchemy.com", version: 2 },
  xdai: { chain: CHAIN.XDAI, baseUrl: "https://blockscout.com/xdai/mainnet", version: 2 },
  zetachain: { chain: CHAIN.ZETA, baseUrl: "https://zetachain.blockscout.com", version: 2 },
  zilliqa: { chain: CHAIN.ZILLIQA, baseUrl: "https://zilliqa.blockscout.com", version: 2 },
  zora: { chain: CHAIN.ZORA, baseUrl: "https://explorer.zora.co", version: 1 },
  zksync: { chain: CHAIN.ZKSYNC, baseUrl: "https://zksync.blockscout.com", version: 2 },
};

async function fetchLine(config: ChainConfig, line: string, date: string) {
  const path = config.version === 1 ? "/api/v1/lines" : "/stats-service/api/v1/lines";
  const baseUrl = config.baseUrl.replace(/\/$/, "");
  const data = await httpGet(`${baseUrl}${path}/${line}?from=${date}&to=${date}&resolution=DAY`);
  return Number(data.chart.find((item: any) => item.date === date)?.value ?? 0);
}

function getBlockscoutUsers(config: ChainConfig) {
  return async (start: number, end: number) => {
    const date = new Date(start * 1e3).toISOString().slice(0, 10);
    const [txcount, usercount] = await Promise.all([
      fetchLine(config, "newTxns", date),
      fetchLine(config, "activeAccounts", date),
    ]);
    return [{
      usercount,
      txcount,
    }];
  };
}

function getBlockscoutNewUsers(config: ChainConfig) {
  return async (start: number, end: number) => {
    return [{
      usercount: await fetchLine(config, "newAccounts", new Date(start * 1e3).toISOString().slice(0, 10)),
    }];
  };
}

export const blockscoutStatsExports = Object.entries(blockscoutStatsChains).map(([id, config]) => ({
  name: id,
  id,
  chain: config.chain,
  type: "chain",
  getUsers: getBlockscoutUsers(config),
  getNewUsers: getBlockscoutNewUsers(config),
}));
