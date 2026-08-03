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
      [CHAIN.XLAYER]: "2024-05-22",
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
    id: "parent#uniswap",
    project: "uniswap",
    chains: {
      [CHAIN.ETHEREUM]: "2020-06-05",
      [CHAIN.ARBITRUM]: "2021-06-04",
      [CHAIN.OPTIMISM]: "2021-11-11",
      [CHAIN.POLYGON]: "2021-12-20",
      [CHAIN.CELO]: "2022-07-07",
      [CHAIN.BSC]: "2023-03-10",
      [CHAIN.AVAX]: "2023-06-21",
      [CHAIN.BASE]: "2023-07-31",
      [CHAIN.LINEA]: "2023-08-22",
      [CHAIN.ERA]: "2023-08-31",
      [CHAIN.XDAI]: "2023-11-28",
      [CHAIN.SCROLL]: "2023-12-11",
      [CHAIN.POLYGON_ZKEVM]: "2023-12-21",
      [CHAIN.ZORA]: "2024-02-28",
      [CHAIN.BLAST]: "2024-03-05",
      [CHAIN.MANTLE]: "2024-05-16",
      [CHAIN.WC]: "2024-08-28",
      [CHAIN.XLAYER]: "2024-09-27",
      [CHAIN.INK]: "2024-12-20",
      [CHAIN.SONIC]: "2024-12-27",
      [CHAIN.UNICHAIN]: "2024-12-29",
      [CHAIN.SONEIUM]: "2025-03-04",
      [CHAIN.PLASMA]: "2025-09-12",
      [CHAIN.MONAD]: "2025-10-20",
      [CHAIN.STABLE]: "2025-11-28",
      [CHAIN.MEGAETH]: "2026-01-16",
      [CHAIN.TEMPO]: "2026-02-26",
      [CHAIN.ROBINHOOD]: "2026-05-22",
    },
    start: "2020-06-05",
  },
  {
    id: "parent#pancakeswap",
    project: "pancakeswap",
    chains: {
      [CHAIN.BSC]: "2020-09-18",
      [CHAIN.ETHEREUM]: "2022-09-27",
      [CHAIN.POLYGON_ZKEVM]: "2023-06-08",
      [CHAIN.ARBITRUM]: "2023-06-19",
      [CHAIN.LINEA]: "2023-07-25",
      [CHAIN.ERA]: "2023-07-27",
      [CHAIN.BASE]: "2023-08-31",
      [CHAIN.SOLANA]: "2025-08-20",
      [CHAIN.MONAD]: "2025-09-30",
    },
    start: "2020-09-18",
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

  { id: "4449", project: "pumpfun", chains: [CHAIN.SOLANA], start: "2024-01-14" }, // pump.fun
  {
    id: "parent#dodo", // DODO AMM
    project: "dodo",
    chains: {
      [CHAIN.ETHEREUM]: "2020-07-22",
      [CHAIN.BSC]: "2021-04-27",
      [CHAIN.POLYGON]: "2021-05-24",
    },
    start: "2020-07-22",
  },
  {
    id: "7260", // ElfomoFi
    project: "elfomofi",
    chains: {
      [CHAIN.BASE]: "2025-12-28",
      [CHAIN.BSC]: "2026-03-03",
    },
    start: "2025-12-28",
  },
  { id: "7599", project: "listadao", chains: [CHAIN.BSC], start: "2025-11-17" }, // Lista DEX
  { id: "parent#potatoswap", project: "potatoswap", chains: [CHAIN.XLAYER], start: "2024-04-16" }, // PotatoSwap V2
  { id: "6368", project: "byreal", chains: [CHAIN.SOLANA], start: "2025-06-26" }, // Byreal
  { id: "7667", project: "whalestreet", chains: [CHAIN.SOLANA], start: "2025-11-20" }, // Whalestreet
  { id: "parent#defituna", project: "defituna", chains: [CHAIN.SOLANA], start: "2026-06-25" }, // DefiTuna AMM
  { id: "3499", project: "ekubo", chains: [CHAIN.ETHEREUM], start: "2025-03-15" }, // Ekubo
  { id: "parent#hydrex", project: "hydrex", chains: [CHAIN.BASE], start: "2026-06-25" }, // Hydrex Integral
  { id: "parent#stabble", project: "stabble", chains: [CHAIN.SOLANA], start: "2024-06-05" }, // stabble Stableswap
  { id: "1788", project: "invariant", chains: [CHAIN.SOLANA], start: "2022-03-22" }, // Invariant
  { id: "parent#saros", project: "saros", chains: [CHAIN.SOLANA], start: "2021-12-16" }, // Saros DLMM
  {
    id: "parent#hyperswap", // HyperSwap V3
    project: "hyperswap",
    chains: {
      [CHAIN.BSC]: "2022-07-01",
      [CHAIN.HYPERLIQUID]: "2025-02-18",
    },
    start: "2022-07-01",
  },
  { id: "5640", project: "sonex", chains: [CHAIN.SONEIUM], start: "2025-01-14" }, // Sonex
  { id: "parent#blackhole", project: "blackhole", chains: [CHAIN.AVAX], start: "2025-07-10" }, // Blackhole CLMM
  {
    id: "parent#dyorswap", // DyorSwap AMM
    project: "dyorswap",
    chains: {
      [CHAIN.XLAYER]: "2024-04-16",
      [CHAIN.INK]: "2024-12-17",
      [CHAIN.SONEIUM]: "2024-12-21",
      [CHAIN.PLASMA]: "2025-09-25",
    },
    start: "2024-04-16",
  },
  { id: "419", project: "saber", chains: [CHAIN.SOLANA], start: "2021-05-28" }, // Saber
  { id: "1155", project: "sheepdex", chains: [CHAIN.BSC], start: "2021-10-10" }, // SheepDex
  { id: "parent#shadow-exchange", project: "shadow", chains: [CHAIN.SONIC], start: "2024-12-27" }, // Shadow Exchange CLMM
  {
    id: "parent#spookyswap", // SpookySwap V2
    project: "spookyswap",
    chains: {
      [CHAIN.FANTOM]: "2021-04-17",
      [CHAIN.SONIC]: "2024-12-11",
    },
    start: "2021-04-17",
  },
  { id: "parent#etherex", project: "etherex", chains: [CHAIN.LINEA], start: "2025-07-26" }, // Etherex CL
  { id: "3053", project: "fluxbeam", chains: [CHAIN.SOLANA], start: "2023-05-29" }, // FluxBeam
  { id: "4294", project: "infusion", chains: [CHAIN.BASE], start: "2024-03-12" }, // Infusion
  { id: "parent#guru-network-dao", project: "thick", chains: [CHAIN.BASE], start: "2024-05-21" }, // Thick
  { id: "parent#swapx", project: "swapx", chains: [CHAIN.SONIC], start: "2024-12-30" }, // SwapX Algebra
  { id: "parent#phoenix", project: "phoenix", chains: [CHAIN.SOLANA], start: "2023-02-15" }, // Phoenix Spot
  { id: "2837", project: "wagmi", chains: [CHAIN.SONIC], start: "2024-12-19" }, // WAGMI
  { id: "parent#equalizer", project: "equalizer", chains: [CHAIN.SONIC], start: "2024-12-10" }, // Equalizer Exchange
  { id: "parent#lynex", project: "lynex", chains: [CHAIN.LINEA], start: "2023-08-14" }, // Lynex V2
  { id: "5816", project: "defive", chains: [CHAIN.SONIC], start: "2025-01-05" }, // DeFive
  { id: "3311", project: "retro", chains: [CHAIN.POLYGON], start: "2023-06-26" }, // Retro
  { id: "parent#ubeswap", project: "ubeswap", chains: [CHAIN.CELO], start: "2021-02-23" }, // Ubeswap V2
  { id: "5593", project: "inkyswap", chains: [CHAIN.INK], start: "2024-12-26" }, // InkySwap
  { id: "4510", project: "revoswap", chains: [CHAIN.XLAYER], start: "2024-04-16" }, // Revoswap
  { id: "3714", project: "sharkswap", chains: [CHAIN.BASE], start: "2023-10-24" }, // SharkSwap DEX
  { id: "parent#metropolis-exchange", project: "metropolis", chains: [CHAIN.SONIC], start: "2024-12-12" }, // Metropolis DLMM
  { id: "873", project: "bscswap", chains: [CHAIN.BSC], start: "2020-09-14" }, // BSCSwap
  { id: "1447", project: "hashflow", chains: [CHAIN.ETHEREUM], start: "2023-10-03" }, // Hashflow
  { id: "parent#thruster", project: "thruster", chains: [CHAIN.BLAST], start: "2024-02-28" }, // Thruster V3
  { id: "3265", project: "agni", chains: [CHAIN.MANTLE], start: "2025-05-21" }, // Agni Finance
  { id: "6798", project: "lithos", chains: [CHAIN.PLASMA], start: "2025-09-29" }, // Lithos
  { id: "parent#merchant-moe", project: "merchant_moe", chains: [CHAIN.MANTLE], start: "2024-03-15" }, // Merchant Moe Liquidity Book
  { id: "parent#synthswap", project: "synthswap", chains: [CHAIN.BASE], start: "2023-07-31" }, // Synthswap V2
  { id: "2745", project: "leetswap", chains: [CHAIN.BASE], start: "2023-07-26" }, // LeetSwap
  { id: "327", project: "youswap", chains: [CHAIN.BSC], start: "2022-07-04" }, // YouSwap
  { id: "parent#9mm", project: "9mm", chains: [CHAIN.BASE], start: "2024-06-14" }, // 9mm V3
  { id: "parent#zkswap-finance", project: "zkswap", chains: [CHAIN.ERA], start: "2023-05-30" }, // zkSwap V2
  { id: "parent#sonus", project: "sonus_exchange", chains: [CHAIN.SONEIUM], start: "2025-01-14" }, // Sonus Exchange AMM
  { id: "5766", project: "bulla", chains: [CHAIN.BERACHAIN], start: "2025-02-06" }, // Bulla Exchange
  { id: "911", project: "sumswap", chains: [CHAIN.ETHEREUM], start: "2021-06-01" }, // SumSwap
  { id: "6791", project: "ionex", chains: [CHAIN.PLASMA], start: "2025-09-27" }, // Ionex
  { id: "parent#octoswap", project: "octoswap", chains: [CHAIN.MONAD], start: "2025-11-12" }, // OctoSwap CL
  { id: "parent#kittenswap", project: "kittenswap", chains: [CHAIN.HYPERLIQUID], start: "2025-02-18" }, // Kittenswap Algebra
  { id: "3255", project: "horizondex", chains: [CHAIN.BASE], start: "2023-10-13" }, // HorizonDEX
  { id: "parent#spiritswap", project: "spiritswap", chains: [CHAIN.FANTOM], start: "2021-04-25" }, // SpiritSwap AMM
  { id: "parent#sonefi", project: "sonefi", chains: [CHAIN.SONEIUM], start: "2025-01-09" }, // SoneFi AMM
  { id: "6045", project: "laminar", chains: [CHAIN.HYPERLIQUID], start: "2025-03-05" }, // Laminar
  { id: "6774", project: "fuseon", chains: [CHAIN.PLASMA], start: "2025-09-25" }, // Fuseon
  { id: "parent#kim-exchange", project: "kim_exchange", chains: [CHAIN.MODE], start: "2024-01-15" }, // KIM Exchange V3
  { id: "5040", project: "xtrade", chains: [CHAIN.XLAYER], start: "2025-10-28" }, // XTrade
  { id: "parent#monoswap", project: "monoswap", chains: [CHAIN.BLAST], start: "2024-02-28" }, // MonoSwap V3
  { id: "1007", project: "safeswap", chains: [CHAIN.ETHEREUM], start: "2021-08-28" }, // SafeSwap
  { id: "5629", project: "squidswap", chains: [CHAIN.INK], start: "2024-12-18" }, // SquidSwap
];

export default dexUsers.map(({ id, project, chains, start }) => ({
  id,
  adapter: alliumDexUsersExport({ project, chains, start }),
}));
