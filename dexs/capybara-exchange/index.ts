import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addOneToken } from "../../helpers/prices";

// ─── Kaia mainnet addresses ────────────────────────────────────────────────────

/** Wombat single-sided AMM pools (HighCovRatioFeePool style) */
const WOMBAT_POOLS = [
  "0x6389dBfa1427a3b0a89cDdc7eA9BBda6E73dECE7", // Main Pool (Wormhole)
  "0x540cce8Ed7d210f71EEAbb9e7Ed7698AC745e077", // Stable Pool (Wormhole)
  "0x5CDE63386D78362267d9A3edC8DA204bB64D07D3", // LST Pool
  "0x4b63eC6284810f62CecBa6F03CF17413b0f4cEc3", // KRWO Pool
  "0x005A8ED563E802B05E5D59df98f8A6548c14A4d7", // LRT Pool
  "0x1dE1578476d9B4237F963eca5D37500Fc33DF3D1", // Main Pool (Stargate)
  "0x2c0537f3360838B50Ab90cB8cD78beAb8Fc1590C", // Stable Pool (Stargate)
  "0x872E7e7422bcAcdcb37f7FffB0cfe3f2F0D6C546", // Superwalk Pool
];

/** Uniswap-V2-style AMM factory */
const V2_FACTORY = "0xE4296d6161c8a1554a18dba79C0f825cE23bAE42";

/** Uniswap-V3-style concentrated liquidity factory */
const V3_FACTORY = "0xC4C8310080F209629EC4c349cb2A3c6720e1176D";

/**
 * Approximate Kaia block at Capybara launch (~2024-05-15).
 * Kaia produces ~1 block/s; current block is ~211M in Mar 2026,
 * so May 2024 ≈ block 153M.  Used as fromBlock for both V2 and V3
 * factory event queries.
 */
const FACTORY_START_BLOCK = 153_000_000;

// ─── Fee constants ─────────────────────────────────────────────────────────────

/** Wombat pool haircut rate (4 bps) */
const WOMBAT_FEE = 0.0004;

/**
 * V2 fee structure (per protocol constants in the frontend):
 *   total  25 bps  = LP 17 bps  +  treasury 2.25 bps  +  buyback 5.75 bps
 */
const V2_FEE_TOTAL = 0.0025;
const V2_FEE_LP    = 0.0017; // supply-side revenue
const V2_FEE_PROTO = 0.0008; // protocol revenue (treasury + buyback)

// V3 fee is per-pool, encoded in the PoolCreated event (units: 1e-6)

// ─── Event ABIs ────────────────────────────────────────────────────────────────

const WOMBAT_SWAP =
  "event Swap(address indexed sender, address fromToken, address toToken, uint256 fromAmount, uint256 toAmount, address indexed to)";

const V2_SWAP =
  "event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)";

const V3_SWAP =
  "event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)";

const V2_PAIR_CREATED =
  "event PairCreated(address indexed token0, address indexed token1, address pair, uint256)";

const V3_POOL_CREATED =
  "event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)";

// ─── Combined fetch ────────────────────────────────────────────────────────────

const fetch = async (options: FetchOptions) => {
  const { createBalances, getLogs, chain, api } = options;
  const dailyVolume            = createBalances();
  const dailyFees              = createBalances();
  const dailySupplySideRevenue = createBalances();
  const dailyProtocolRevenue   = createBalances();

  // ── 1. Wombat single-sided AMM pools ────────────────────────────────────────
  const wombatLogs = await getLogs({ targets: WOMBAT_POOLS, eventAbi: WOMBAT_SWAP });
  for (const log of wombatLogs) {
    const { fromToken, toToken, fromAmount, toAmount } = log;
    addOneToken({ chain, balances: dailyVolume, token0: fromToken, amount0: fromAmount, token1: toToken, amount1: toAmount });
    addOneToken({ chain, balances: dailyFees,   token0: fromToken, amount0: Number(fromAmount) * WOMBAT_FEE, token1: toToken, amount1: Number(toAmount) * WOMBAT_FEE });
  }

  // ── 2. V2 AMM pairs ─────────────────────────────────────────────────────────
  // The Capybara V2 factory emits PairCreated (not a standard allPairs array),
  // so we discover pairs via getLogs – which also gives us token0/token1 for free.
  const pairCreatedLogs = await getLogs({
    target: V2_FACTORY,
    eventAbi: V2_PAIR_CREATED,
    fromBlock: FACTORY_START_BLOCK,
    cacheInCloud: true,
  });

  if (pairCreatedLogs.length > 0) {
    const v2Pairs = pairCreatedLogs.map((l: any) => l.pair as string);
    const v2PairMeta: Record<string, [string, string]> = {};
    for (const l of pairCreatedLogs) {
      v2PairMeta[(l.pair as string).toLowerCase()] = [l.token0, l.token1];
    }

    const v2Logs = await getLogs({ targets: v2Pairs, eventAbi: V2_SWAP, flatten: false }) as any[][];
    v2Logs.forEach((logs, idx) => {
      if (!logs.length) return;
      const [token0, token1] = v2PairMeta[v2Pairs[idx].toLowerCase()];
      for (const log of logs) {
        // Volume: one of each pair (In/Out) is non-zero per swap direction;
        // addOneToken picks the core-asset side, preventing double-counting.
        addOneToken({ chain, balances: dailyVolume, token0, amount0: log.amount0In,  token1, amount1: log.amount1In  });
        addOneToken({ chain, balances: dailyVolume, token0, amount0: log.amount0Out, token1, amount1: log.amount1Out });
        // Fees are paid on the input token only
        addOneToken({ chain, balances: dailyFees,              token0, amount0: Number(log.amount0In) * V2_FEE_TOTAL, token1, amount1: Number(log.amount1In) * V2_FEE_TOTAL });
        addOneToken({ chain, balances: dailySupplySideRevenue, token0, amount0: Number(log.amount0In) * V2_FEE_LP,    token1, amount1: Number(log.amount1In) * V2_FEE_LP    });
        addOneToken({ chain, balances: dailyProtocolRevenue,   token0, amount0: Number(log.amount0In) * V2_FEE_PROTO, token1, amount1: Number(log.amount1In) * V2_FEE_PROTO });
      }
    });
  }

  // ── 3. V3 concentrated liquidity pools ──────────────────────────────────────
  // Discover all pools via factory PoolCreated events (cached in cloud after first run).
  const poolCreatedLogs = await getLogs({
    target: V3_FACTORY,
    eventAbi: V3_POOL_CREATED,
    fromBlock: FACTORY_START_BLOCK,
    cacheInCloud: true,
  });

  if (poolCreatedLogs.length > 0) {
    const v3Pools = poolCreatedLogs.map((l: any) => l.pool as string);
    const v3Meta: Record<string, { token0: string; token1: string; feeRatio: number }> = {};
    for (const l of poolCreatedLogs) {
      v3Meta[l.pool.toLowerCase()] = {
        token0: l.token0,
        token1: l.token1,
        feeRatio: Number(l.fee) / 1_000_000, // fee is in hundredths of a bip
      };
    }

    const v3SwapLogs = await getLogs({ targets: v3Pools, eventAbi: V3_SWAP, flatten: false }) as any[][];
    v3SwapLogs.forEach((logs, idx) => {
      if (!logs.length) return;
      const meta = v3Meta[v3Pools[idx].toLowerCase()];
      if (!meta) return;
      const { token0, token1, feeRatio } = meta;
      for (const log of logs) {
        // amount0/amount1 are int256; addOneToken normalises sign automatically
        addOneToken({ chain, balances: dailyVolume, token0, amount0: log.amount0, token1, amount1: log.amount1 });
        // Fee is paid on the input side; using abs of both and letting addOneToken pick core asset
        addOneToken({ chain, balances: dailyFees, token0, amount0: Math.abs(Number(log.amount0)) * feeRatio, token1, amount1: Math.abs(Number(log.amount1)) * feeRatio });
      }
    });
  }

  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Volume:               "Notional volume across all pool types: Wombat single-sided AMM, V2 AMM, and V3 concentrated liquidity",
  Fees:                 "Wombat pools: 4 bps haircut; V2 pools: 25 bps; V3 pools: dynamic per-pool fee tier (0.01 % / 0.05 % / 0.3 % / 1 %)",
  SupplySideRevenue:    "V2 LP share of swap fees (17 bps of 25 bps total)",
  ProtocolRevenue:      "V2 protocol share of swap fees (8 bps of 25 bps total – treasury + buyback)",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  skipBreakdownValidation: true,
  methodology,
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: "2024-05-15",
    },
  },
};

export default adapter;
