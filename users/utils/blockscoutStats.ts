import fetchURL, { httpGet } from "../../utils/fetchURL";
import { ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

type ChainConfig = {
  chain: string;
  baseUrl: string;
  statsUrl?: string;
  version: 1 | 2;
};

const blockscoutStatsChains: Record<string, ChainConfig> = {
  ancient8: { chain: CHAIN.ANCIENT8, baseUrl: "https://explorer-ancient8-mainnet-0.t.conduit.xyz", version: 1 },
  apechain: { chain: CHAIN.APECHAIN, baseUrl: "https://apechain.calderaexplorer.xyz", statsUrl: "https://apechain.calderaexplorer.xyz/stats", version: 1 },
  astar: { chain: CHAIN.ASTAR, baseUrl: "https://astar.blockscout.com", version: 2 },
  aurora: { chain: CHAIN.AURORA, baseUrl: "https://aurorascan.dev", version: 2 },
  bob: { chain: CHAIN.BOB, baseUrl: "https://explorer-bob-mainnet-0.t.conduit.xyz", version: 1 },
  boba: { chain: CHAIN.BOBA, baseUrl: "https://blockscout.boba.network", version: 2 },
  celo: { chain: CHAIN.CELO, baseUrl: "https://celo.blockscout.com", version: 2 },
  corn: { chain: CHAIN.CORN, baseUrl: "https://explorer-corn-maizenet.t.conduit.xyz", version: 1 },
  coti: { chain: CHAIN.COTI, baseUrl: "https://mainnet.cotiscan.io", version: 2 },
  cross: { chain: CHAIN.CROSS, baseUrl: "https://www.crossscan.io", version: 2 },
  doma: { chain: CHAIN.DOMA, baseUrl: "https://explorer.doma.xyz", version: 1 },
  earnm: { chain: CHAIN.EARNM, baseUrl: "https://earnm-mainnet.explorer.alchemy.com", version: 2 },
  endurance: { chain: CHAIN.ENDURANCE, baseUrl: "https://explorer-endurance.fusionist.io", version: 2 },
  energyweb: { chain: CHAIN.ENERGYWEB, baseUrl: "https://explorer.energyweb.org", version: 2 },
  eni: { chain: CHAIN.ENI, baseUrl: "https://scan.eniac.network", version: 1 },
  ethereumclassic: { chain: CHAIN.ETHEREUM_CLASSIC, baseUrl: "https://etc.blockscout.com", version: 2 },
  etherlink: { chain: CHAIN.ETHERLINK, baseUrl: "https://explorer.etherlink.com", version: 2 },
  ethereal: { chain: CHAIN.ETHEREAL, baseUrl: "https://explorer.ethereal.trade", version: 1 },
  eventum: { chain: CHAIN.EVENTUM, baseUrl: "https://explorer.evedex.com", version: 2 },
  everclear: { chain: CHAIN.EVERCLEAR, baseUrl: "https://scan.everclear.org", version: 2 },
  filecoin: { chain: CHAIN.FILECOIN, baseUrl: "https://filecoin.blockscout.com", version: 2 },
  flare: { chain: CHAIN.FLARE, baseUrl: "https://flare-explorer.flare.network", version: 1 },
  flynet: { chain: CHAIN.FLYNET, baseUrl: "https://explorer.flynet.org", version: 1 },
  flow: { chain: CHAIN.FLOW, baseUrl: "https://evm.flowscan.io", statsUrl: "https://evm.flowscan.io:8080", version: 1 },
  fuse: { chain: CHAIN.FUSE, baseUrl: "https://explorer.fuse.io", version: 2 },
  harmony: { chain: CHAIN.HARMONY, baseUrl: "https://explorer.harmony.one", statsUrl: "https://stats.explorer.harmony.one", version: 1 },
  hemi: { chain: CHAIN.HEMI, baseUrl: "https://explorer.hemi.xyz", version: 1 },
  "hashkey": { chain: CHAIN.HASHKEY, baseUrl: "https://hashkey.blockscout.com", version: 2 },
  hpp: { chain: CHAIN.HPP, baseUrl: "https://explorer.hpp.io", version: 1 },
  igra: { chain: CHAIN.IGRA, baseUrl: "https://explorer.igralabs.com", statsUrl: "https://stats.explorer.igralabs.com", version: 1 },
  "immutablex": { chain: CHAIN.IMX, baseUrl: "https://explorer.immutable.com", version: 2 },
  ink: { chain: CHAIN.INK, baseUrl: "https://explorer.inkonchain.com", version: 2 },
  "iota_evm": { chain: CHAIN.IOTAEVM, baseUrl: "https://explorer.evm.iota.org", version: 2 },
  kub: { chain: CHAIN.KUB, baseUrl: "https://www.kubscan.com", version: 1 },
  lightlink: { chain: CHAIN.LIGHTLINK_PHOENIX, baseUrl: "https://phoenix.lightlink.io", version: 2 },
  lisk: { chain: CHAIN.LISK, baseUrl: "https://blockscout.lisk.com", version: 2 },
  lumia: { chain: CHAIN.LUMIA, baseUrl: "https://explorer.lumia.org", version: 2 },
  matchain: { chain: CHAIN.MATCHAIN, baseUrl: "https://matchscan.io", version: 2 },
  mode: { chain: CHAIN.MODE, baseUrl: "https://explorer.mode.network", version: 2 },
  neon: { chain: CHAIN.NEON, baseUrl: "https://neon.blockscout.com", version: 2 },
  "edu-chain": { chain: CHAIN.EDU_CHAIN, baseUrl: "https://educhain.blockscout.com", version: 2 },
  "orderly-network": { chain: CHAIN.ORDERLY, baseUrl: "https://explorer.orderly.network", version: 1 },
  perennial: { chain: CHAIN.PERENNIAL, baseUrl: "https://explorer.perennial.foundation", version: 1 },
  plume: { chain: CHAIN.PLUME, baseUrl: "https://explorer.plume.org", version: 1 },
  prom: { chain: CHAIN.PROM, baseUrl: "https://promscan.io", version: 2 },
  redstone: { chain: CHAIN.REDSTONE, baseUrl: "https://explorer.redstone.xyz", version: 2 },
  reyachain: { chain: CHAIN.REYA, baseUrl: "https://explorer.reya.network", version: 2 },
  rootstock: { chain: CHAIN.ROOTSTOCK, baseUrl: "https://rootstock.blockscout.com", version: 2 },
  shape: { chain: CHAIN.SHAPE, baseUrl: "https://shapescan.xyz", version: 2 },
  shido: { chain: CHAIN.SHIDO, baseUrl: "https://www.shidoscan.com", version: 1 },
  shimmerevm: { chain: CHAIN.SHIMMER_EVM, baseUrl: "https://explorer.evm.shimmer.network", version: 2 },
  songbird: { chain: CHAIN.SONGBIRD, baseUrl: "https://songbird-explorer.flare.network", version: 1 },
  soneium: { chain: CHAIN.SONEIUM, baseUrl: "https://soneium.blockscout.com", version: 2 },
  superposition: { chain: CHAIN.SUPERPOSITION, baseUrl: "https://explorer-superposition-1v9rjalnat.t.conduit.xyz", version: 1 },
  superseed: { chain: CHAIN.SSEED, baseUrl: "https://explorer.superseed.xyz", version: 1 },
  story: { chain: CHAIN.STORY, baseUrl: "https://www.storyscan.io", version: 2 },
  swellchain: { chain: CHAIN.SWELLCHAIN, baseUrl: "https://explorer.swellnetwork.io", version: 1 },
  syndicate: { chain: CHAIN.SYNDICATE, baseUrl: "https://explorer.syndicate.io", version: 2 },
  syscoin: { chain: CHAIN.SYSCOIN, baseUrl: "https://explorer.syscoin.org", version: 1 },
  tac: { chain: CHAIN.TAC, baseUrl: "https://explorer.tac.build", version: 2 },
  unichain: { chain: CHAIN.UNICHAIN, baseUrl: "https://unichain.blockscout.com", version: 2 },
  worldchain: { chain: CHAIN.WC, baseUrl: "https://worldchain-mainnet.explorer.alchemy.com", version: 2 },
  gnosis: { chain: CHAIN.XDAI, baseUrl: "https://blockscout.com/xdai/mainnet", version: 2 },
  zetachain: { chain: CHAIN.ZETA, baseUrl: "https://zetachain.blockscout.com", version: 2 },
  zilliqa: { chain: CHAIN.ZILLIQA, baseUrl: "https://zilliqa.blockscout.com", version: 2 },
  zora: { chain: CHAIN.ZORA, baseUrl: "https://explorer.zora.co", version: 1 },
  "zksync-era": { chain: CHAIN.ZKSYNC, baseUrl: "https://zksync.blockscout.com", version: 2 },
  fluent: { chain: CHAIN.FLUENT, baseUrl: "https://fluentscan.xyz", statsUrl: "https://fluentscan.xyz/node-api/proxy", version: 1 },
  citrea: { chain: CHAIN.CITREA, baseUrl: "https://explorer.mainnet.citrea.xyz", statsUrl: "https://explorer-stats.mainnet.citrea.xyz", version: 1 },
  gatelayer: { chain: CHAIN.GATE_LAYER, baseUrl: "https://www.gatescan.org/gatelayer", statsUrl: "https://gl-exp-api-m.gatescan.org/stats", version: 1 },
};

async function fetchLine(config: ChainConfig, line: string, date: string) {
  const path = config.version === 1 ? "/api/v1/lines" : "/stats-service/api/v1/lines";
  const baseUrl = (config.statsUrl ?? config.baseUrl).replace(/\/$/, "");
  const data = await fetchURL(`${baseUrl}${path}/${line}?from=${date}&to=${date}&resolution=DAY`);
  return Number(data.chart.find((item: any) => item.date === date).value);
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
  protocolType: ProtocolType.CHAIN,
  getUsers: getBlockscoutUsers(config),
  getNewUsers: getBlockscoutNewUsers(config),
}));
