import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const TREASURY = "0x21ad6ef3979638d8e73747f22b92c4aade145d82".toLowerCase();

const CHAINS: Array<string> = [
  CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.OPTIMISM, CHAIN.ARBITRUM, CHAIN.POLYGON, CHAIN.BSC,
  CHAIN.SCROLL, CHAIN.MANTLE, CHAIN.LINEA, CHAIN.ERA, 
  CHAIN.BLAST, CHAIN.MODE,
  CHAIN.ZORA, CHAIN.METIS, 
  CHAIN.REDSTONE, 
  CHAIN.XDAI, CHAIN.APECHAIN, CHAIN.XLAYER, 
  CHAIN.BOTANIX,
  CHAIN.CRONOS, CHAIN.CELO, CHAIN.CONFLUX, 
  CHAIN.RONIN, CHAIN.LISK, CHAIN.BERACHAIN, CHAIN.CORE,
  CHAIN.BOB, CHAIN.ZIRCUIT, CHAIN.MORPH, CHAIN.MANTA, 
  CHAIN.ANCIENT8, 
  CHAIN.TAIKO,
  CHAIN.POLYGON_ZKEVM, CHAIN.WC, 
  CHAIN.KLAYTN,
  CHAIN.ABSTRACT, CHAIN.SONEIUM, CHAIN.INK,
  CHAIN.UNICHAIN, CHAIN.PLUME, CHAIN.SONIC
]

const abis: any = {
  treasury: "function treasury() view returns (address)",
};

const COUNTERS: Record<string, string[]> = {
  [CHAIN.BASE]: [
    "0x8fc7aa44971a7b111017fc435ef6daf10bf1b887",
    "0x8ccd9c0a9c084412416a85fd748c7f1e9b86442d",
  ],
  [CHAIN.LINEA]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.SCROLL]: [
    "0x064dacc2f126f036d77cd4b8887efedb2f5201fe",
    "0x53092f84ef2460d8517f011f7722125758de5aa2",
  ],
  [CHAIN.MANTLE]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.CRONOS]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.CELO]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.BSC]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.ABSTRACT]: [
    "0xe94158b16cd46b190f74a2ccbff7fdecf0da8bf4",
    "0xefb45cd4cff4d11d4b029659e618daacd8d18f3",
  ],
  [CHAIN.KLAYTN]: [
    "0x676590111782691132a560301014510d30d0053c",
    "0x5fcea004bc26308bc91d8599dba4a271c57cba85",
  ],
  [CHAIN.BERACHAIN]: [
    "0x2522bfee6451f7a1f64e3ab287d8cf46c173601f",
    "0x9cad0d6a8927cb0757f435b8e5ecb6b095862596",
  ],
  [CHAIN.OPTIMISM]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.UNICHAIN]: [
    "0x30efc910a135d73016a788fdd9a9e8b022dea208",
    "0xff4e5275f5b1b69e94773fa4134be4c752c42705",
  ],
  [CHAIN.INK]: [
    "0x3033d7ded400547d6442c55159da5c61f2721633",
    "0x63c489d31a2c3de0638360931f47ff066282473f",
  ],
  [CHAIN.SONEIUM]: [
    "0x6baaa0653e53f92e11316973bfc1fc8291fc6f58",
    "0xdefe1db2713ba0c51334343dca576bd5f4e793b2",
  ],
  [CHAIN.BOB]: [
    "0xc11ee6c94a86e18481d9206c29ecdd3b40c59898",
    "0x0246d65ba41da3db6db55e489146eb25ca3634e5",
  ],
  [CHAIN.PLUME]: [
    "0x86683f28df33adcd1cadc815855102c1685731fc",
    "0x6e126d13a5451780401804f55cec3686192d29f7",
  ],
  [CHAIN.CONFLUX]: [
    "0x649617c710776c6ac41be36eda94929654a685a7",
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
  ],
  [CHAIN.LISK]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.ZIRCUIT]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.METIS]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.ARBITRUM]: [
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
    "0x6c8de6c102a844b885291d1ce1cafdacf0a553d8",
  ],
  [CHAIN.AVAX]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.SONIC]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.XDAI]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.TAIKO]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.APECHAIN]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.BLAST]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.ANCIENT8]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.BOTANIX]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.ZORA]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.XLAYER]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.MORPH]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.MANTA]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.CORE]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
  [CHAIN.REDSTONE]: [
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
  ],
  // [CHAIN.XAI]: [
  //   "0xf617d89a811a39f06f5271f89db346a0ae297f71",
  //   "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  // ],
  [CHAIN.POLYGON_ZKEVM]: [
    "0xf617d89a811a39f06f5271f89db346a0ae297f71",
    "0x2f96d7dd813b8e17071188791b78ea3fab5c109c",
  ],
};


const fetch = async (_a:any, _b:any, options: FetchOptions) => {
  // if (!COUNTERS[options.chain]) {
  //   return { dailyFees: options.createBalances(), dailyRevenue: options.createBalances() };
  // }
  // const _treasury = await options.api.call({ target: COUNTERS[options.chain][0], abi: abis.treasury })
  const [balStart, balEnd] = await Promise.all([
    options.fromApi.provider.getBalance(TREASURY),
    options.toApi.provider.getBalance(TREASURY)
  ]);
  const delta = Number(balEnd) - Number(balStart);
  const fees = delta > 0n ? delta : 0n;
  const dailyFees = options.createBalances();
  dailyFees.addGasToken(fees);
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  start: "2025-08-11",
  chains: CHAINS,
  methodology: {
    Fees: "fees from GMCounter logs: if referral is set, fee x (1 - referralFees/BPS), otherwise full fee.",
    Revenue: "fees accrue to protocol treasury. If no GMCounter address provided for a chain, fallback is treasury net inflow for that chain/day.",
  },
};

export default adapter;
