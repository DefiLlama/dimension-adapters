import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// shadowpaper is a house: every BTC/ETH position is a synthetic bet against the protocol-owned LP, priced at the
// Binance USDⓈ-M index. There is no open, close or funding fee. The only fee is the 2% fee emitted in PositionClosed:
// on the gain of a winning close, or LP-side on a losing close / cash-funded liquidation while the payout queue is empty.
// When accrued it is split staker = floor(fee / 2), dev = fee - staker. A winning fee that cannot accrue stays in the LP.
// Event amounts are 18-decimal ledger units on both chains; Arc settles in 6-decimal USDC (ledger = raw * 1e12).
const config: Record<string, { exchange: string; token: string; scale: bigint }> = {
  [CHAIN.BSC]: { exchange: "0x1C6Ca75b7A9E9F9Bdd25f602292E6cf2658A638c", token: "0x55d398326f99059fF775485246999027B3197955", scale: 1n },
  [CHAIN.ARC]: { exchange: "0x298f17dfeA7cD582637f3ce3C6Fad075e01Bc1a0", token: "0x3600000000000000000000000000000000000000", scale: 10n ** 12n },
};

const POSITION_CLOSED = "event PositionClosed(uint256 indexed posId, address indexed user, uint64 closePx, int256 pnl, int256 adjPnl, bool isLiquidation, uint256 fee, uint256 devFeeAccrued)";

const fetch = async (options: FetchOptions) => {
  const { exchange, token, scale } = config[options.chain];
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // PositionClosed is emitted once per close, forced close and liquidation; Liquidated/ForceSettled are not re-counted.
  const closes = await options.getLogs({ target: exchange, eventAbi: POSITION_CLOSED });
  for (const log of closes) {
    const fee = BigInt(log.fee);
    if (fee === 0n) continue;
    const dev = BigInt(log.devFeeAccrued);
    if (dev !== 0n && dev !== fee - fee / 2n) throw new Error("shadowpaper: unexpected fee split");
    const staker = dev === 0n ? 0n : fee - dev;
    const retained = fee - dev - staker;
    const label = log.isLiquidation ? METRIC.LIQUIDATION_FEES : METRIC.TRADING_FEES;
    dailyFees.add(token, (fee / scale).toString(), label);
    dailyProtocolRevenue.add(token, (dev / scale).toString(), "Fees To Dev");
    dailyHoldersRevenue.add(token, (staker / scale).toString(), "Fees To SPAPER Stakers");
    dailySupplySideRevenue.add(token, (retained / scale).toString(), "Fees Retained In LP");
  }
  dailyRevenue.addBalances(dailyProtocolRevenue);
  dailyRevenue.addBalances(dailyHoldersRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BSC, CHAIN.ARC],
  start: "2026-11-11",
  methodology: {
    Fees: "2% fee on the gain of winning closes, plus a 2% LP-side fee on losing closes and on margin forfeited in cash-funded liquidations, taken only while the payout queue is empty. No open, close or funding fees. Trader losses kept by the LP are not counted.",
    Revenue: "Fees accrued to the dev share and to SPAPER stakers.",
    ProtocolRevenue: "Dev share: half of each accrued fee (the odd wei goes to dev). 20% of the dev share is used to buy back and burn SOLON; this is done off-chain later and is not counted separately here.",
    HoldersRevenue: "Half of each accrued fee, credited to SPAPER stakers.",
    SupplySideRevenue: "Winning-close fees that cannot accrue to dev and stakers and stay in the protocol-owned LP.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% fee emitted on winning and losing closes.",
      [METRIC.LIQUIDATION_FEES]: "2% LP-side fee on margin forfeited in cash-funded liquidations.",
    },
    Revenue: {
      "Fees To Dev": "Dev share of accrued fees.",
      "Fees To SPAPER Stakers": "Staker share of accrued fees.",
    },
    ProtocolRevenue: { "Fees To Dev": "Dev share of accrued fees." },
    HoldersRevenue: { "Fees To SPAPER Stakers": "Staker share of accrued fees." },
    SupplySideRevenue: { "Fees Retained In LP": "Winning-close fees retained by the protocol-owned LP." },
  },
};

export default adapter;
