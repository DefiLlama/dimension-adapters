import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getHouseSnapshotAtEnd, getProtocolWindowDeltas } from "../helpers/papertrade";

// The only fee is 2% of realized PnL (win fee on gains after the impact haircut, LP-side fee on losses and liquidations),
// paid out only while the payout queue is empty, half to PAPER stakers and half to the dev fee recipient
// (https://docs.papertrade.xyz/#/paper/staking). The API reports the staker half as cumulative `stakingRewards`.
const STAKER_SHARE = 0.5;
// Above the staker reward cap the same push also sweeps LP surplus to stakers and the API does not separate it,
// so stop rather than count house PnL as fees; a fee-only source is needed past this point.
const STAKER_REWARD_CAP_USD = 5_000_000;

const fetch = async (options: FetchOptions) => {
  const { lp } = await getHouseSnapshotAtEnd(options, ["lp"]);
  if (lp > STAKER_REWARD_CAP_USD) throw new Error(`papertrade: LP is ${lp} USD, above the ${STAKER_REWARD_CAP_USD} staker reward cap, stakingRewards now includes LP surplus`);

  const { stakingRewards } = await getProtocolWindowDeltas(options, ["stakingRewards"]);
  const totalFees = stakingRewards / STAKER_SHARE;
  const devFees = totalFees - stakingRewards;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addUSDValue(totalFees, METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(stakingRewards, "Trading Fees To PAPER Stakers");
  dailyRevenue.addUSDValue(devFees, "Trading Fees To Dev Fee Recipient");
  dailyHoldersRevenue.addUSDValue(stakingRewards, "Trading Fees To PAPER Stakers");
  dailyProtocolRevenue.addUSDValue(devFees, "Trading Fees To Dev Fee Recipient");

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-10-10", // public launch
  methodology: {
    Fees: "The 2% fee Papertrade takes on realized trading PnL: a win fee on the gain of profitable closes and a fee carved from the LP's gain on losing closes and liquidations, counted when it is distributed (fees are only paid out while the payout queue is empty). Excludes the asymmetric-impact haircut and trader losses kept by the protocol-owned LP, and LP surplus paid to stakers above the $5M LP cap.",
    Revenue: "All of the 2% PnL fee. There are no external liquidity providers: half goes to PAPER stakers and half to the dev fee recipient.",
    ProtocolRevenue: "The half of the 2% PnL fee paid to the dev fee recipient.",
    HoldersRevenue: "The half of the 2% PnL fee paid in USDC to PAPER stakers.",
    SupplySideRevenue: "Zero. Traders bet against the protocol-owned LP, which has no outside depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% of realized PnL: the win fee on profitable closes plus the LP-side fee on losing closes and liquidations.",
    },
    Revenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee, distributed in USDC to PAPER stakers.",
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee, claimable by the dev fee recipient set by the contract owner.",
    },
    ProtocolRevenue: {
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee, claimable by the dev fee recipient set by the contract owner.",
    },
    HoldersRevenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee, distributed in USDC to PAPER stakers.",
    },
  },
};

export default adapter;
