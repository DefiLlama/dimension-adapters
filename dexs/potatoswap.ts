import type { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";

const SWAP_EVENT =
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";
const FEE_RATE = 0.003;

const POOLS = [
  {
    address: "0xc71f9e1de80eb505c0cb3bbf90ae6593130e5d25",
    token0: "0x1e4a5963abfd975d8c9021ce480b42188849d41d",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "USDT/WOKB",
  },
  {
    address: "0xd352a852a328d7eccc8bbf63e2e1dd73c68527cd",
    token0: "0x779ded0c9e1022225f8e0630b35a9b54be713736",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "USDT0/WOKB",
  },
  {
    address: "0x81e5ecb20522ffba19680ef4f866121f29c86442",
    token0: "0x903358faf7c6304afbd560e9e29b12ab1b8fddc5",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "DOG/WOKB",
  },
  {
    address: "0xdfdeb88d43970bcbfb2e6b1c531a97c2ec8aefaf",
    token0: "0x4c225fb675c0c475b53381463782a7f741d59763",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "OEOE/WOKB",
  },
  {
    address: "0x8fa64b477ae8222cbdec45a3e2639946366d05c6",
    token0: "0xa49e20536132223d412b656dc3dfbf98303b1111",
    token1: "0xe538905cf8410324e03a5a23c1c177a474d59b2b",
    name: "MAS/WOKB",
  },
];

const HOLDERS_REVENUE_RATIO = 0.08 / 0.25;
const SUPPLY_SIDE_REVENUE_RATIO = 0.17 / 0.25;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  const logsByPool = await options.getLogs({
    targets: POOLS.map((pool) => pool.address),
    eventAbi: SWAP_EVENT,
    flatten: false,
  });

  POOLS.forEach((pool, index) => {
    const logs = logsByPool[index] || [];

    logs.forEach((log: any) => {
      addOneToken({
        chain: options.chain,
        balances: dailyVolume,
        token0: pool.token0,
        token1: pool.token1,
        amount0: log.amount0In,
        amount1: log.amount1In,
      });
      addOneToken({
        chain: options.chain,
        balances: dailyVolume,
        token0: pool.token0,
        token1: pool.token1,
        amount0: log.amount0Out,
        amount1: log.amount1Out,
      });
      addOneToken({
        chain: options.chain,
        balances: dailyFees,
        token0: pool.token0,
        token1: pool.token1,
        amount0: Number(log.amount0In) * FEE_RATE,
        amount1: Number(log.amount1In) * FEE_RATE,
      });
      addOneToken({
        chain: options.chain,
        balances: dailyFees,
        token0: pool.token0,
        token1: pool.token1,
        amount0: Number(log.amount0Out) * FEE_RATE,
        amount1: Number(log.amount1Out) * FEE_RATE,
      });
    });
  });

  const dailyHoldersRevenue = dailyFees.clone(HOLDERS_REVENUE_RATIO);
  const dailySupplySideRevenue = dailyFees.clone(SUPPLY_SIDE_REVENUE_RATIO);

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees:
    "Calculated from on-chain Swap logs on X Layer across core PotatoSwap v2 pools (USDT/WOKB, USDT0/WOKB, DOG/WOKB, OEOE/WOKB, MAS/WOKB) using the standard pair Swap event and a 0.3% fee rate.",
  UserFees:
    "Users pay a 0.3% fee on swaps in the tracked core PotatoSwap v2 pools.",
  SupplySideRevenue:
    "68% of the tracked fees are attributed to liquidity providers, preserving the existing PotatoSwap v2 revenue split.",
  HoldersRevenue:
    "32% of the tracked fees are attributed to vePOT holders, preserving the existing PotatoSwap v2 revenue split.",
  ProtocolRevenue:
    "No direct protocol revenue is assigned in the PotatoSwap v2 adapter.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.XLAYER],
  runAtCurrTime: true,
  methodology,
  start: "2024-04-23",
};

export default adapter;
