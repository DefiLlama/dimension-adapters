import fetchURL, { httpGet } from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

type ChainConfig = {
  chain: string;
  baseUrl: string;
  statsUrl?: string;
  version: 1 | 2;
  start?: string;
};

const blockscoutStatsChains: Record<string, ChainConfig> = {
  ancient8: { chain: CHAIN.ANCIENT8, baseUrl: "https://explorer-ancient8-mainnet-0.t.conduit.xyz", version: 1, start: "2024-01-23" },
  apechain: { chain: CHAIN.APECHAIN, baseUrl: "https://apechain.calderaexplorer.xyz", statsUrl: "https://apechain.calderaexplorer.xyz/stats", version: 1, start: "2024-08-28" },
  astar: { chain: CHAIN.ASTAR, baseUrl: "https://astar.blockscout.com", version: 2, start: "2022-01-17" },
  aurora: { chain: CHAIN.AURORA, baseUrl: "https://aurorascan.dev", version: 2, start: "2021-05-12" },
  bob: { chain: CHAIN.BOB, baseUrl: "https://explorer-bob-mainnet-0.t.conduit.xyz", version: 1, start: "2024-04-11" },
  boba: { chain: CHAIN.BOBA, baseUrl: "https://blockscout.boba.network", version: 2, start: "2021-10-28" },
  celo: { chain: CHAIN.CELO, baseUrl: "https://celo.blockscout.com", version: 2, start: "2020-04-22" },
  corn: { chain: CHAIN.CORN, baseUrl: "https://explorer-corn-maizenet.t.conduit.xyz", version: 1, start: "2024-11-19" },
  coti: { chain: CHAIN.COTI, baseUrl: "https://mainnet.cotiscan.io", version: 2, start: "2025-03-24" },
  cross: { chain: CHAIN.CROSS, baseUrl: "https://www.crossscan.io", version: 2, start: "2025-04-25" },
  doma: { chain: CHAIN.DOMA, baseUrl: "https://explorer.doma.xyz", version: 1, start: "2025-09-15" },
  earnm: { chain: CHAIN.EARNM, baseUrl: "https://earnm-mainnet.explorer.alchemy.com", version: 2, start: "2025-06-17" },
  endurance: { chain: CHAIN.ENDURANCE, baseUrl: "https://explorer-endurance.fusionist.io", version: 2, start: "2024-03-04" },
  energyweb: { chain: CHAIN.ENERGYWEB, baseUrl: "https://explorer.energyweb.org", version: 2, start: "2019-06-17" },
  eni: { chain: CHAIN.ENI, baseUrl: "https://scan.eniac.network", version: 1, start: "2025-06-01" },
  ethereumclassic: { chain: CHAIN.ETHEREUM_CLASSIC, baseUrl: "https://etc.blockscout.com", version: 2, start: "2015-08-07" },
  etherlink: { chain: CHAIN.ETHERLINK, baseUrl: "https://explorer.etherlink.com", version: 2, start: "2024-05-06" },
  ethereal: { chain: CHAIN.ETHEREAL, baseUrl: "https://explorer.ethereal.trade", version: 1, start: "2025-09-22" },
  eventum: { chain: CHAIN.EVENTUM, baseUrl: "https://explorer.evedex.com", version: 2, start: "2024-11-28" },
  // everclear: { chain: CHAIN.EVERCLEAR, baseUrl: "https://scan.everclear.org", version: 2 }, // Disabled as the api and explorer responds 404
  filecoin: { chain: CHAIN.FILECOIN, baseUrl: "https://filecoin.blockscout.com", version: 2, start: "2023-03-14" },
  flare: { chain: CHAIN.FLARE, baseUrl: "https://flare-explorer.flare.network", version: 1, start: "2022-07-13" },
  flynet: { chain: CHAIN.FLYNET, baseUrl: "https://explorer.flynet.org", version: 1, start: "2025-02-14" },
  flow: { chain: CHAIN.FLOW, baseUrl: "https://evm.flowscan.io", statsUrl: "https://evm.flowscan.io:8080", version: 1, start: "2024-09-04" },
  fuse: { chain: CHAIN.FUSE, baseUrl: "https://explorer.fuse.io", version: 2, start: "2019-07-29" },
  harmony: { chain: CHAIN.HARMONY, baseUrl: "https://explorer.harmony.one", statsUrl: "https://stats.explorer.harmony.one", version: 1, start: "2019-08-15" },
  hemi: { chain: CHAIN.HEMI, baseUrl: "https://explorer.hemi.xyz", version: 1, start: "2024-09-09" },
  "hashkey": { chain: CHAIN.HASHKEY, baseUrl: "https://hashkey.blockscout.com", version: 2, start: "2024-12-16" },
  hpp: { chain: CHAIN.HPP, baseUrl: "https://explorer.hpp.io", version: 1, start: "2025-07-18" },
  igra: { chain: CHAIN.IGRA, baseUrl: "https://explorer.igralabs.com", statsUrl: "https://stats.explorer.igralabs.com", version: 1, start: "2026-02-25" },
  "immutablex": { chain: CHAIN.IMX, baseUrl: "https://explorer.immutable.com", version: 2, start: "2023-12-11" },
  ink: { chain: CHAIN.INK, baseUrl: "https://explorer.inkonchain.com", version: 2, start: "2024-12-06" },
  "iota_evm": { chain: CHAIN.IOTAEVM, baseUrl: "https://explorer.evm.iota.org", version: 2, start: "2024-03-15" },
  kub: { chain: CHAIN.KUB, baseUrl: "https://www.kubscan.com", version: 1, start: "2021-05-06" },
  lightlink: { chain: CHAIN.LIGHTLINK_PHOENIX, baseUrl: "https://phoenix.lightlink.io", version: 2, start: "2023-01-24" },
  lisk: { chain: CHAIN.LISK, baseUrl: "https://blockscout.lisk.com", version: 2, start: "2024-05-03" },
  lumia: { chain: CHAIN.LUMIA, baseUrl: "https://explorer.lumia.org", version: 2, start: "2024-06-27" },
  matchain: { chain: CHAIN.MATCHAIN, baseUrl: "https://matchscan.io", version: 2, start: "2024-07-18" },
  mode: { chain: CHAIN.MODE, baseUrl: "https://explorer.mode.network", version: 2, start: "2023-11-17" },
  neon: { chain: CHAIN.NEON, baseUrl: "https://neon.blockscout.com", version: 2, start: "2023-05-25" },
  "edu-chain": { chain: CHAIN.EDU_CHAIN, baseUrl: "https://educhain.blockscout.com", version: 2, start: "2024-07-26" },
  "orderly-network": { chain: CHAIN.ORDERLY, baseUrl: "https://explorer.orderly.network", version: 1, start: "2023-10-06" },
  perennial: { chain: CHAIN.PERENNIAL, baseUrl: "https://explorer.perennial.foundation", version: 1, start: "2025-02-05" },
  plume: { chain: CHAIN.PLUME, baseUrl: "https://explorer.plume.org", version: 1, start: "2025-02-20" },
  prom: { chain: CHAIN.PROM, baseUrl: "https://promscan.io", version: 2, start: "2024-10-29" },
  redstone: { chain: CHAIN.REDSTONE, baseUrl: "https://explorer.redstone.xyz", version: 2, start: "2024-05-01" },
  reyachain: { chain: CHAIN.REYA, baseUrl: "https://explorer.reya.network", version: 2, start: "2024-03-02" },
  rootstock: { chain: CHAIN.ROOTSTOCK, baseUrl: "https://rootstock.blockscout.com", version: 2, start: "2018-01-04" },
  shape: { chain: CHAIN.SHAPE, baseUrl: "https://shapescan.xyz", version: 2, start: "2024-07-23" },
  shido: { chain: CHAIN.SHIDO, baseUrl: "https://www.shidoscan.com", version: 1, start: "2024-04-22" },
  shimmerevm: { chain: CHAIN.SHIMMER_EVM, baseUrl: "https://explorer.evm.shimmer.network", version: 2, start: "2023-09-14" },
  songbird: { chain: CHAIN.SONGBIRD, baseUrl: "https://songbird-explorer.flare.network", version: 1, start: "2021-09-16" },
  soneium: { chain: CHAIN.SONEIUM, baseUrl: "https://soneium.blockscout.com", version: 2, start: "2024-12-02" },
  superposition: { chain: CHAIN.SUPERPOSITION, baseUrl: "https://explorer-superposition-1v9rjalnat.t.conduit.xyz", version: 1, start: "2024-09-06" },
  superseed: { chain: CHAIN.SSEED, baseUrl: "https://explorer.superseed.xyz", version: 1, start: "2024-09-12" },
  story: { chain: CHAIN.STORY, baseUrl: "https://www.storyscan.io", version: 2, start: "2025-01-23" },
  swellchain: { chain: CHAIN.SWELLCHAIN, baseUrl: "https://explorer.swellnetwork.io", version: 1, start: "2024-11-27" },
  syndicate: { chain: CHAIN.SYNDICATE, baseUrl: "https://explorer.syndicate.io", version: 2, start: "2025-07-29" },
  syscoin: { chain: CHAIN.SYSCOIN, baseUrl: "https://explorer.syscoin.org", version: 1, start: "2021-12-07" },
  tac: { chain: CHAIN.TAC, baseUrl: "https://explorer.tac.build", version: 2, start: "2025-06-11" },
  unichain: { chain: CHAIN.UNICHAIN, baseUrl: "https://unichain.blockscout.com", version: 2, start: "2024-11-04" },
  worldchain: { chain: CHAIN.WC, baseUrl: "https://worldchain-mainnet.explorer.alchemy.com", version: 2, start: "2024-06-25" },
  gnosis: { chain: CHAIN.XDAI, baseUrl: "https://blockscout.com/xdai/mainnet", version: 2, start: "2018-11-01" },
  zetachain: { chain: CHAIN.ZETA, baseUrl: "https://zetachain.blockscout.com", version: 2, start: "2024-01-31" },
  zilliqa: { chain: CHAIN.ZILLIQA, baseUrl: "https://zilliqa.blockscout.com", version: 2, start: "2023-12-27" },
  zora: { chain: CHAIN.ZORA, baseUrl: "https://explorer.zora.co", version: 1, start: "2023-06-13" },
  "zksync-era": { chain: CHAIN.ZKSYNC, baseUrl: "https://zksync.blockscout.com", version: 2, start: "2023-02-14" },
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
  type: "chain",
  start: config.start,
  getUsers: getBlockscoutUsers(config),
  getNewUsers: getBlockscoutNewUsers(config),
}));
