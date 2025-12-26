import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// === SOLIDLY FACTORY (FANTOM) ===
const FACTORY_ADDRESS = "0x3fAaB499b519fdC5819e3D7ed0C26111904cbc28";

// Swap event ABI (Solidly/Velodrome format)
const SWAP_EVENT =
  "event Swap(address indexed sender,uint256 amount0In,uint256 amount1In,uint256 amount0Out,uint256 amount1Out,address indexed to)";

// ABIs
const FACTORY_ABI = [
  {
    name: "allPairsLength",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function",
    inputs: [],
  },
  {
    name: "allPairs",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
    inputs: [{ type: "uint256" }],
  },
];

const PAIR_ABI = [
  {
    name: "token0",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
    inputs: [],
  },
  {
    name: "token1",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function",
    inputs: [],
  },
  {
    name: "stable",
    outputs: [{ type: "bool" }],
    stateMutability: "view",
    type: "function",
    inputs: [],
  },
];

// Fees for each type
const BASIS_POINTS = 10000n;
const VOLATILE_FEE_BPS = 25n; // 0.25%
const STABLE_FEE_BPS = 1n;    // 0.01%

const fetch = async (options: FetchOptions) => {
  const { api, getLogs, createBalances } = options;
  const dailyFees = createBalances();

  // 1. Fetch all pairs
  const pairsLength: bigint = await api.call({
    abi: FACTORY_ABI[0],
    target: FACTORY_ADDRESS,
  });

  if (!pairsLength || pairsLength === 0n) {
    return {
      dailyFees: createBalances(),
      dailyRevenue: createBalances(),
      dailyProtocolRevenue: createBalances(),
    };
  }

  const pairs: string[] = await api.multiCall({
    abi: FACTORY_ABI[1],
    target: FACTORY_ADDRESS,
    calls: Array.from({ length: Number(pairsLength) }, (_, i) => ({
      params: [i],
    })),
  });

  // Remove any null/zero address pairs
  const validPairs = pairs.filter(
    (p) => p && p !== "0x0000000000000000000000000000000000000000"
  );

  // 2. Get pair metadata
  const [token0s, token1s, stables] = await Promise.all([
    api.multiCall({
      abi: PAIR_ABI[0],
      calls: validPairs,
    }),
    api.multiCall({
      abi: PAIR_ABI[1],
      calls: validPairs,
    }),
    api.multiCall({
      abi: PAIR_ABI[2],
      calls: validPairs,
    }),
  ]);

  const pairInfo: Record<string, { token0: string; token1: string; feeBps: bigint }> = {};
  validPairs.forEach((pair, i) => {
    const lower = pair.toLowerCase();
    pairInfo[lower] = {
      token0: token0s[i],
      token1: token1s[i],
      feeBps: stables[i] ? STABLE_FEE_BPS : VOLATILE_FEE_BPS,
    };
  });

  // 3. Fetch logs
  const logs = await getLogs({
    targets: validPairs,
    eventAbi: SWAP_EVENT,
  });

  // 4. Compute fees for each log
  for (const log of logs) {
    const address = (log.address || log.contract_address)?.toLowerCase();
    const meta = address && pairInfo[address];
    if (!meta) continue;

    // Defensive: flattened or nested format
    const amount0In = BigInt(log.amount0In || log.args?.amount0In || 0);
    const amount0Out = BigInt(log.amount0Out || log.args?.amount0Out || 0);
    const amount1In = BigInt(log.amount1In || log.args?.amount1In || 0);
    const amount1Out = BigInt(log.amount1Out || log.args?.amount1Out || 0);

    // Solidly-style: input - output = swap fee for each
    if (amount0In > 0n && amount0Out >= 0n) {
      const fee0 = (amount0In - amount0Out) || (amount0In * meta.feeBps) / BASIS_POINTS;
      if (fee0 > 0n) dailyFees.add(meta.token0, fee0.toString());
    }
    if (amount1In > 0n && amount1Out >= 0n) {
      const fee1 = (amount1In - amount1Out) || (amount1In * meta.feeBps) / BASIS_POINTS;
      if (fee1 > 0n) dailyFees.add(meta.token1, fee1.toString());
    }
  }

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: createBalances(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch,
      start: 1640995200, // Jan 1, 2022
    },
  },
};

export default adapter;