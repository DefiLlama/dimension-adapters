import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// shadowpaper is a house: every BTC/ETH position is a synthetic bet against the protocol-owned LP, priced at the
// Binance USDⓈ-M index. There is no open, close or funding fee. The only fee is the 2% fee emitted in PositionClosed:
// on the gain of a winning close, or LP-side on a losing close / cash-funded liquidation while the payout queue is empty.
// When accrued it is split staker = floor(fee / 2), dev = fee - staker. A winning fee that cannot accrue stays in the LP.
// Event amounts are 18-decimal ledger units on both chains, so they are booked without rescaling:
// BSC settles in USDT (18 decimals); Arc settles in the 6-decimal USDC facade (ledger = raw * 1e12), so Arc fees are
// booked as native USDC (zero address, 18 decimals), which prices the same.
const config: Record<string, { exchange: string; token: string }> = {
  [CHAIN.BSC]: { exchange: "0x1C6Ca75b7A9E9F9Bdd25f602292E6cf2658A638c", token: ADDRESSES.bsc.USDT },
  [CHAIN.ARC]: { exchange: "0x298f17dfeA7cD582637f3ce3C6Fad075e01Bc1a0", token: ADDRESSES.null },
};

const POSITION_CLOSED = "event PositionClosed(uint256 indexed posId, address indexed user, uint64 closePx, int256 pnl, int256 adjPnl, bool isLiquidation, uint256 fee, uint256 devFeeAccrued)";

const fetch = async (options: FetchOptions) => {
  const { exchange, token } = config[options.chain];
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
    dailyFees.add(token, fee.toString(), label);
    dailyProtocolRevenue.add(token, dev.toString(), "Fees To Dev");
    dailyHoldersRevenue.add(token, staker.toString(), "Fees To SPAPER Stakers");
    dailySupplySideRevenue.add(token, retained.toString(), "Fees Retained In LP");
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
    Fees: "A 2% fee on trader profit when a winning BTC or ETH position closes, plus a 2% fee on the trader's loss or forfeited margin that the protocol-owned pool wins on losing closes and liquidations (charged only while the payout queue is empty). There are no opening, closing or funding fees, and trader losses kept by the pool are not counted as fees.",
    Revenue: "The part of trading and liquidation fees paid out to the developer and to SPAPER stakers.",
    ProtocolRevenue: "Half of each paid-out trading and liquidation fee, sent to the developer. 20% of this share is later used off-chain to buy back and burn SOLON, which is not tracked separately.",
    HoldersRevenue: "Half of each paid-out trading and liquidation fee, distributed to SPAPER stakers.",
    SupplySideRevenue: "Fees on winning trades that are not paid out to the developer or stakers and stay in the protocol-owned pool that takes the other side of every trade.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% of the profit on winning closes, and 2% of the trader's loss on losing closes collected by the pool.",
      [METRIC.LIQUIDATION_FEES]: "2% of the margin forfeited to the pool in cash-funded liquidations.",
    },
    Revenue: {
      "Fees To Dev": "Half of each paid-out fee, sent to the developer.",
      "Fees To SPAPER Stakers": "Half of each paid-out fee, distributed to SPAPER stakers.",
    },
    ProtocolRevenue: { "Fees To Dev": "Half of each paid-out fee, sent to the developer." },
    HoldersRevenue: { "Fees To SPAPER Stakers": "Half of each paid-out fee, distributed to SPAPER stakers." },
    SupplySideRevenue: { "Fees Retained In LP": "Winning-close fees that are not paid out and stay in the protocol-owned pool." },
  },
};

export default adapter;
