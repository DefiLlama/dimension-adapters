import { CHAIN } from "../helpers/chains";
import { alliumLendingUsersExport } from "./utils/alliumUsers";

// `id` is the DefiLlama protocol id, `project` Allium's slug in crosschain.lending.*.
// Dates are each chain's first lending event in Allium.
const lendingUsers: { id: string; project: string; chains: Record<string, string>; start: string }[] = [
  {
    id: "4025", // Morpho Blue
    project: "morpho",
    chains: {
      [CHAIN.ETHEREUM]: "2024-01-03",
      [CHAIN.BASE]: "2024-05-21",
      [CHAIN.POLYGON]: "2025-02-05",
      [CHAIN.OPTIMISM]: "2025-02-19",
      [CHAIN.ARBITRUM]: "2025-03-14",
      [CHAIN.SONIC]: "2025-04-02",
      [CHAIN.INK]: "2025-04-04",
      [CHAIN.WC]: "2025-04-06",
      [CHAIN.HYPERLIQUID]: "2025-04-25",
      [CHAIN.UNICHAIN]: "2025-05-21",
      [CHAIN.SCROLL]: "2025-05-24",
      [CHAIN.KATANA]: "2025-06-23",
      [CHAIN.SONEIUM]: "2025-08-09",
      [CHAIN.BSC]: "2025-09-03",
      [CHAIN.CELO]: "2025-09-11",
      [CHAIN.MONAD]: "2025-11-13",
      [CHAIN.STABLE]: "2025-11-13",
      [CHAIN.TEMPO]: "2026-04-02",
      [CHAIN.ROBINHOOD]: "2026-05-21",
    },
    start: "2024-01-03",
  },
  {
    id: "parent#aave", // Aave
    project: "aave",
    chains: {
      [CHAIN.ETHEREUM]: "2020-01-08",
      [CHAIN.POLYGON]: "2021-03-31",
      [CHAIN.AVAX]: "2021-10-04",
      [CHAIN.ARBITRUM]: "2022-12-29",
      [CHAIN.OPTIMISM]: "2022-12-29",
      [CHAIN.BASE]: "2023-08-22",
      [CHAIN.XDAI]: "2023-11-07",
      [CHAIN.BSC]: "2024-01-23",
      [CHAIN.SCROLL]: "2024-02-09",
      [CHAIN.ERA]: "2024-09-20",
      [CHAIN.LINEA]: "2025-02-11",
      [CHAIN.SONIC]: "2025-03-03",
      [CHAIN.CELO]: "2025-03-17",
      [CHAIN.SONEIUM]: "2025-06-03",
      [CHAIN.PLASMA]: "2025-09-23",
      [CHAIN.INK]: "2025-10-13",
    },
    start: "2020-01-08",
  },
  {
    id: "5044", // Euler V2
    project: "euler",
    chains: {
      [CHAIN.ETHEREUM]: "2024-08-18",
      [CHAIN.BASE]: "2024-12-04",
      [CHAIN.SONIC]: "2025-02-04",
      [CHAIN.AVAX]: "2025-02-14",
      [CHAIN.UNICHAIN]: "2025-02-14",
      [CHAIN.BSC]: "2025-03-31",
      [CHAIN.ARBITRUM]: "2025-06-25",
      [CHAIN.LINEA]: "2025-08-11",
      [CHAIN.OPTIMISM]: "2025-08-15",
      [CHAIN.PLASMA]: "2025-09-19",
      [CHAIN.MONAD]: "2025-11-25",
      [CHAIN.HYPERLIQUID]: "2025-12-12",
    },
    start: "2024-08-18",
  },
  {
    id: "4167", // Fluid Lending
    project: "fluid",
    chains: {
      [CHAIN.ETHEREUM]: "2024-02-19",
      [CHAIN.ARBITRUM]: "2024-07-07",
      [CHAIN.BASE]: "2024-08-02",
      [CHAIN.POLYGON]: "2025-03-05",
      [CHAIN.PLASMA]: "2025-09-19",
    },
    start: "2024-02-19",
  },
  {
    id: "2187", // Dolomite
    project: "dolomite",
    chains: {
      [CHAIN.ARBITRUM]: "2022-10-04",
      [CHAIN.ETHEREUM]: "2025-06-26",
      [CHAIN.XLAYER]: "2026-04-06",
    },
    start: "2022-10-04",
  },
  {
    id: "2929", // SparkLend
    project: "spark",
    chains: {
      [CHAIN.ETHEREUM]: "2023-03-29",
      [CHAIN.XDAI]: "2023-10-09",
    },
    start: "2023-03-29",
  },
  {
    id: "1853", // Moonwell
    project: "moonwell",
    chains: {
      [CHAIN.BASE]: "2023-08-09",
      [CHAIN.OPTIMISM]: "2024-07-29",
    },
    start: "2023-08-09",
  },
  {
    id: "5554", // Extra Finance
    project: "extra_finance",
    chains: {
      [CHAIN.BASE]: "2023-07-30",
      [CHAIN.OPTIMISM]: "2024-11-06",
    },
    start: "2023-07-30",
  },
  {
    id: "3171", // Kinza
    project: "kinza_finance",
    chains: {
      [CHAIN.BSC]: "2023-06-21",
      [CHAIN.ETHEREUM]: "2024-04-17",
    },
    start: "2023-06-21",
  },
  { id: "3770", project: "kamino", chains: { [CHAIN.SOLANA]: "2023-03-20" }, start: "2023-03-20" }, // Kamino Lend
  { id: "6600", project: "jupiter", chains: { [CHAIN.SOLANA]: "2025-07-25" }, start: "2025-07-25" }, // Jupiter Lend
  { id: "6056", project: "lista_dao", chains: { [CHAIN.BSC]: "2025-04-08" }, start: "2025-04-08" }, // Lista Lending
  { id: "5940", project: "hyperlend", chains: { [CHAIN.HYPERLIQUID]: "2025-03-08" }, start: "2025-03-08" }, // HyperLend
  { id: "7005", project: "neverland", chains: { [CHAIN.MONAD]: "2025-11-01" }, start: "2025-11-01" }, // Neverland
  { id: "5627", project: "sake_finance", chains: { [CHAIN.SONEIUM]: "2025-01-08" }, start: "2025-01-08" }, // Sake Finance
  { id: "7053", project: "curvance", chains: { [CHAIN.MONAD]: "2026-01-09" }, start: "2026-01-09" }, // Curvance
  { id: "467", project: "benqi", chains: { [CHAIN.AVAX]: "2021-08-18" }, start: "2021-08-18" }, // Benqi Lending
  { id: "587", project: "maple", chains: { [CHAIN.ETHEREUM]: "2023-01-25" }, start: "2023-01-25" }, // Maple
];

export default lendingUsers.map(({ id, project, chains, start }) => ({
  id,
  adapter: alliumLendingUsersExport({ project, chains, start }),
}));
