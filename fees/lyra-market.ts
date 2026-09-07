import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";

// ─────────────────────────────────────────────
// Lyra Market — RWA trading interface
//
// LyraSwapRouter routes user swaps between USDC and tokenized real-world
// asset tokens into Uniswap v2/v3/v4 pools via Uniswap's UniversalRouter,
// and charges an interface fee on the USDC leg of each trade.
//
// The router is stateless: it pulls USDC (or the RWA token) from the trader,
// executes the route, and forwards the output to the trader within the same
// transaction. It custodies nothing, and the pool liquidity it trades against
// belongs to Uniswap LPs — so Lyra reports no TVL of its own for this product,
// and the volume below also executes on Uniswap -> doublecounted.
// ─────────────────────────────────────────────

// LyraSwapRouter, Ethereum mainnet.
const ROUTER = "0xDF39355e24e6e92Ca9D00180e687dd131B6B7ee5";
const DEPLOY_BLOCK = 25544021; // 2026-07-16

// Canonical Ethereum USDC — every trade has USDC on one side, and the
// interface fee is always denominated in it.
const USDC = ADDRESSES.ethereum.USDC;

const INTERFACE_FEE_EVENT =
  "event InterfaceFeeCollected(address indexed token, address indexed trader, uint256 feeUsdc, bool isBuy)";
const FEE_BPS_UPDATED_EVENT =
  "event FeeBpsUpdated(uint16 oldBps, uint16 newBps)";

// Rate set in the router's constructor at deploy. The owner can change it
// through setFeeBps (capped by MAX_FEE_BPS), which emits FeeBpsUpdated — no
// such event has fired to date, so this has been the rate since launch.
const INITIAL_FEE_BPS = 20n; // 0.20%
const BPS_DENOM = 10000n;

async function fetch(options: FetchOptions) {
  // Separate balance objects — the framework post-processes each independently.
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  // Build the fee-rate history from logs rather than calling feeBps() at the
  // period's block: that call needs archive state, which the public RPC pool
  // often cannot serve for anything but recent blocks.
  const rateLogs = await options.getLogs({
    target: ROUTER,
    eventAbi: FEE_BPS_UPDATED_EVENT,
    fromBlock: DEPLOY_BLOCK,
    toBlock: await options.getToBlock(),
    entireLog: true,
    parseLog: true,
    cacheInCloud: true,
  });
  const rateChanges = rateLogs
    .map((log: any) => ({
      block: Number(log.blockNumber),
      bps: BigInt(log.parsedLog.args.newBps),
    }))
    .sort((a: any, b: any) => a.block - b.block);

  const feeBpsAt = (block: number) => {
    let bps = INITIAL_FEE_BPS;
    for (const change of rateChanges) {
      if (change.block > block) break;
      bps = change.bps;
    }
    return bps;
  };

  const logs = await options.getLogs({
    target: ROUTER,
    eventAbi: INTERFACE_FEE_EVENT,
    entireLog: true,
    parseLog: true,
  });

  for (const log of logs) {
    const fee = BigInt(log.parsedLog.args.feeUsdc);

    // The router takes its cut off the gross USDC leg in both directions —
    // on a buy from the USDC sent in, on a sell from the USDC received —
    // so the traded notional is exactly fee / feeRate.
    dailyVolume.add(USDC, (fee * BPS_DENOM) / feeBpsAt(Number(log.blockNumber)));

    dailyFees.add(USDC, fee, METRIC.TRADING_FEES);
    dailyRevenue.add(USDC, fee, METRIC.TRADING_FEES);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
}

const methodology = {
  Volume:
    "USDC notional of swaps routed through LyraSwapRouter into Uniswap v2/v3/v4 pools, reconstructed from each InterfaceFeeCollected event by dividing the collected fee by the fee rate in effect at that block. The fee is charged on the gross USDC leg of every trade, so this reproduces the traded notional exactly. As with any aggregator, this volume also executes on Uniswap and is counted there under Uniswap's own adapter.",
  Fees: "The interface fee LyraSwapRouter charges on the USDC leg of each routed swap (0.20% since deploy), taken from the InterfaceFeeCollected event. Uniswap's LP fee is excluded — it is paid to Uniswap LPs and Lyra cannot capture it.",
  Revenue:
    "Equal to fees (0.20% of the swap's notional value). There is no supply side: Lyra provides no liquidity for this product, so nothing is shared with LPs.",
  ProtocolRevenue:
    "All interface fees (0.20% of the swap's notional value) are sent to the Lyra fee collector. No token exists and no share is paid to holders.",
  UserFees: "The full interface fee is paid by the trader on each swap.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]:
      "0.20% interface fee on the USDC leg of each swap routed through LyraSwapRouter.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]:
      "The interface fee (0.20% of the swap's notional value) is retained in full — no liquidity providers to share it with.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Interface fees (0.20% of the swap's notional value) accrue to the Lyra fee collector.",
  },
  UserFees: {
    [METRIC.TRADING_FEES]: "Interface fee (0.20% of the swap's notional value) paid by the trader on each swap.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  // The router is an interface on top of Uniswap: every swap it reports executes in a
  // Uniswap v2/v3/v4 pool that Uniswap's own adapter already counts.
  doublecounted: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-07-16",
  methodology,
  breakdownMethodology,
};

export default adapter;
