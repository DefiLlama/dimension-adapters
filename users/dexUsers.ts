import { CHAIN } from "../helpers/chains";
import { alliumDexUsersExport } from "./utils/alliumUsers";

// `id` is the DefiLlama protocol id, `project` Allium's slug, dates each chain's first trade. Parent ids where one Allium project spans several children.
const dexUsers: { id: string; project: string; chains: string[] | Record<string, string>; start: string }[] = [
  {
    id: "3", // Curve DEX
    project: "curve",
    chains: {
      [CHAIN.ETHEREUM]: "2020-01-23",
      [CHAIN.FANTOM]: "2021-02-20",
      [CHAIN.POLYGON]: "2021-04-19",
      [CHAIN.ARBITRUM]: "2021-09-12",
      [CHAIN.AVAX]: "2021-10-04",
      [CHAIN.OPTIMISM]: "2022-01-17",
      [CHAIN.BASE]: "2023-08-28",
      [CHAIN.FRAXTAL]: "2024-03-12",
      [CHAIN.XDAI]: "2025-01-07",
      [CHAIN.HYPERLIQUID]: "2025-02-21",
      [CHAIN.CELO]: "2025-04-10",
      [CHAIN.PLASMA]: "2025-11-19",
      [CHAIN.MONAD]: "2025-11-22",
      [CHAIN.UNICHAIN]: "2025-11-23",
    },
    start: "2020-01-23",
  },
  {
    id: "5317", // Fluid DEX
    project: "fluid",
    chains: {
      [CHAIN.ETHEREUM]: "2024-10-29",
      [CHAIN.ARBITRUM]: "2024-12-19",
      [CHAIN.BASE]: "2025-02-14",
      [CHAIN.POLYGON]: "2025-04-02",
      [CHAIN.PLASMA]: "2025-09-24",
    },
    start: "2024-10-29",
  },
  { id: "parent#pharaoh-exchange", project: "pharaoh", chains: [CHAIN.AVAX], start: "2023-12-10" },
  { id: "parent#sun", project: "sunswap", chains: [CHAIN.TRON], start: "2021-12-14" },
  { id: "6444", project: "project_x", chains: [CHAIN.HYPERLIQUID], start: "2025-07-08" },

  // Solana
  { id: "5936", project: "pumpswap", chains: [CHAIN.SOLANA], start: "2025-02-20" },
  { id: "parent#meteora", project: "meteora", chains: [CHAIN.SOLANA], start: "2022-07-27" },
  { id: "214", project: "raydium", chains: [CHAIN.SOLANA], start: "2021-03-21" },
  { id: "283", project: "orca", chains: [CHAIN.SOLANA], start: "2021-02-14" },
  { id: "parent#solfi", project: "solfi", chains: [CHAIN.SOLANA], start: "2024-10-29" },
  { id: "7215", project: "bisonfi", chains: [CHAIN.SOLANA], start: "2025-11-05" },
  { id: "6556", project: "goonfi", chains: [CHAIN.SOLANA], start: "2025-05-26" },
  { id: "6557", project: "tesserav", chains: [CHAIN.SOLANA], start: "2025-08-21" },
  { id: "6554", project: "humidifi", chains: [CHAIN.SOLANA], start: "2025-05-27" },
  { id: "7218", project: "alphaq", chains: [CHAIN.SOLANA], start: "2025-07-10" },
  { id: "5349", project: "manifest", chains: [CHAIN.SOLANA], start: "2024-10-12" },
  { id: "6884", project: "aquifer", chains: [CHAIN.SOLANA], start: "2025-07-03" },
  { id: "7666", project: "scorch", chains: [CHAIN.SOLANA], start: "2026-02-19" },
];

export default dexUsers.map(({ id, project, chains, start }) => ({
  id,
  adapter: alliumDexUsersExport({ project, chains, start }),
}));
