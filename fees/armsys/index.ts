import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

// ARMSys — a Uniswap v4 dynamic-fee hook (volatility-laddered swap fees) live on
// Base (ETH/USDC) and Robinhood Chain (tokenized equities NVDA/INTC/SPCX vs USDG).
//
// Everything is measured from on-chain events, the same way the protocol's own
// published daily reports do it:
//   - LP side: PoolManager `Swap` events for the hook's pools. The event's `fee`
//     field is the LP fee in pips, charged on the input side of the swap.
//   - Protocol side: `HookFeeCollected(poolId, recipient, currency, amount)` on
//     the hook — the treasury share is minted before the LP fee applies, so the
//     two never overlap.
// Swaps sent by the protocol's own keeper (its PoolSwapTest router warms the
// sample ring on quiet pools) are excluded from every figure, matching the
// protocol's own external-vs-self accounting.

const T_SWAP = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f";
const T_HOOKFEE = "0x66b812eed335fdc113a52e231f8ef389f0bd52d9e8710dffab976481aeace5a8";

type PoolCfg = { pid: string; token0: string; token1: string };
type ChainCfg = { poolManager: string; hook: string; keeper: string; pools: PoolCfg[] };

const CONFIG: Record<string, ChainCfg> = {
  [CHAIN.BASE]: {
    poolManager: "0x498581fF718922c3f8e6A244956aF099B2652b2b",
    hook: "0x7fB4846d3987476577319f112731BB04f45880C8",
    keeper: "0x252aeca194843310b83f3426cd4e4a7622aba166",
    pools: [
      { // ETH/USDC, dynamic fee
        pid: "0x088b6b69cbcaf84dae02a28dc7b62912ec105b6970d1ab7b985e4e50b6088ccd",
        token0: ADDRESSES.null, // native ETH is currency0 in v4
        token1: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // USDC
      },
    ],
  },
  [CHAIN.ROBINHOOD]: {
    poolManager: "0x8366a39CC670B4001A1121B8F6A443A643e40951",
    hook: "0x20f8B7ec9cC3Bb5c739deDB15a8b4275F84B00c8",
    keeper: "0x4be8dd43025b34c2a1c7ab3a347f8d2109cd5226",
    pools: [
      { // USDG/NVDA
        pid: "0x53e74184f024eb01ceb7bbde68866bff3cc3ddf378c78745eb52bdd9ad7bcd91",
        token0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
        token1: "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec", // NVDA
      },
      { // USDG/INTC
        pid: "0x0703d548618b02c35d53acc889c1edb792aabccde3217004cd7dabb604fad3bd",
        token0: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
        token1: "0xc72b96e0e48ecd4dc75e1e45396e26300bc39681", // INTC
      },
      { // SPCX/USDG — note the inverted order: SPCX sorts below USDG
        pid: "0xdbd476102c84ca90d501b1330b11e9a6c092ab9a811a7f6a45b1d971872fab13",
        token0: "0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa", // SPCX
        token1: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168", // USDG
      },
    ],
  },
};

const TWO_255 = 1n << 255n;
const TWO_256 = 1n << 256n;

// event words are sign-extended across the full 256 bits — take the sign off 256,
// not off the field's nominal width
function word(data: string, i: number): bigint {
  return BigInt("0x" + data.slice(2 + i * 64, 2 + (i + 1) * 64));
}
function signed(v: bigint): bigint {
  return v >= TWO_255 ? v - TWO_256 : v;
}

const fetch = async (options: FetchOptions) => {
  const cfg = CONFIG[options.chain];
  const lpFees = options.createBalances();
  const hookFees = options.createBalances();
  const keeperTx = new Set<string>();

  for (const pool of cfg.pools) {
    const logs = await options.getLogs({
      target: cfg.poolManager,
      topics: [T_SWAP, pool.pid],
      entireLog: true,
    });
    for (const log of logs) {
      const sender = "0x" + log.topics[2].slice(26).toLowerCase();
      if (sender === cfg.keeper) {
        keeperTx.add((log.transactionHash || log.transaction_hash).toLowerCase());
        continue;
      }
      const a0 = signed(word(log.data, 0));
      const a1 = signed(word(log.data, 1));
      const feePips = word(log.data, 5);
      // the fee is charged on the input side — the positive amount
      if (a0 > 0n) lpFees.add(pool.token0, (a0 * feePips) / 1_000_000n);
      else if (a1 > 0n) lpFees.add(pool.token1, (a1 * feePips) / 1_000_000n);
    }
  }

  const hookLogs = await options.getLogs({
    target: cfg.hook,
    topics: [T_HOOKFEE],
    entireLog: true,
  });
  for (const log of hookLogs) {
    const tx = (log.transactionHash || log.transaction_hash).toLowerCase();
    if (keeperTx.has(tx)) continue; // the keeper paying the hook is not revenue
    const currency = "0x" + log.data.slice(2 + 24, 2 + 64);
    const amount = word(log.data, 1);
    hookFees.add(currency === "0x0000000000000000000000000000000000000000" ? ADDRESSES.null : currency, amount);
  }

  const dailyFees = options.createBalances();
  dailyFees.addBalances(lpFees, METRIC.LP_FEES);
  dailyFees.addBalances(hookFees, "Hook Fees");

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addBalances(lpFees, "Token Swap Fees To LPs");

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(hookFees, "Hook Fees To Treasury");

  const dailyProtocolRevenue = options.createBalances();
  dailyProtocolRevenue.addBalances(hookFees, "Hook Fees To Treasury");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees paid by traders in ARMSys dynamic-fee pools (LP fee from PoolManager Swap events + the hook's treasury share from HookFeeCollected). Swaps made by the protocol's own keeper are excluded.",
  Revenue: "The hook's treasury share of swap fees (HookFeeCollected events), excluding the protocol's own keeper flow.",
  ProtocolRevenue: "Same as Revenue — the treasury share accrues to the protocol.",
  SupplySideRevenue: "The LP share of swap fees, excluding the protocol's own keeper flow.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.LP_FEES]: "LP share of dynamic swap fees from PoolManager Swap events (fee field in pips, charged on the input side).",
    "Hook Fees": "Protocol hook treasury share from HookFeeCollected events, minted before the LP fee applies.",
  },
  Revenue: {
    "Hook Fees To Treasury": "The hook's treasury share of swap fees (HookFeeCollected events), excluding the protocol's own keeper flow.",
  },
  ProtocolRevenue: {
    "Hook Fees To Treasury": "The hook's treasury share of swap fees (HookFeeCollected events), excluding the protocol's own keeper flow.",
  },
  SupplySideRevenue: {
    "Token Swap Fees To LPs": "The LP share of swap fees from PoolManager Swap events, excluding the protocol's own keeper flow.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  methodology,
  breakdownMethodology,
  doublecounted: true, // LP fees from the same Uniswap v4 PoolManager Swap events are counted in dexs/uniswap-v4
  adapter: {
    [CHAIN.BASE]: { fetch, start: "2026-04-27" },
    [CHAIN.ROBINHOOD]: { fetch, start: "2026-07-31" },
  },
};

export default adapter;
