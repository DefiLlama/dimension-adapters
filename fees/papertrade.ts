import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { METRIC } from "../helpers/metrics";
import { getProtocolWindowDeltas } from "../helpers/papertrade";

// Papertrade is a house: every position is a bet against the protocol-owned LP, so gross income is traders' net realized
// losses. It splits into explicit fees (2% of realized PnL on closes, 2% of lost margin on liquidations, half to PAPER
// stakers and half to the dev fee recipient) and house PnL, which fills the LP up to the $5M staker reward cap and is
// swept 98% to stakers above it (https://docs.papertrade.xyz/#/paper/staking).
// Fee halves come from the Exchange's settlement events (source unverified, signatures resolved from the bytecode and
// reconciled against the contract's fee accumulators); trader PnL and staker distributions from the stats counters.
const EXCHANGE = "0x6cd5661646289fb6e65ea5c032310fded797d0a2"; // HyperEVM
// only the fee words are used, the other names are inferred
const POSITIONS_CLOSED = "event PositionsClosed(address indexed user, uint256 marginReturned, uint256 balanceAfter, uint256 stakerFee, uint256 devFee)";
const LIQUIDATED = "event Liquidated(uint256 indexed positionId, address indexed user, uint64 markPrice, uint64 bustPrice, bool fromQueuedBalance, uint256 stakerFee, uint256 devFee)";
const usd = (x: bigint) => Number(x / 10n ** 12n) / 1e6; // fee words are USD with 18 decimals

const sumFees = (logs: any[]) => logs.reduce((acc, log) => ({ staker: acc.staker + usd(BigInt(log.stakerFee)), dev: acc.dev + usd(BigInt(log.devFee)) }), { staker: 0, dev: 0 });

const fetch = async (options: FetchOptions) => {
  // listed under off_chain (synthetic bets against the house), the contract itself lives on HyperEVM
  const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.HYPERLIQUID), getBlock(options.toTimestamp, CHAIN.HYPERLIQUID)]);
  const getLogs = (eventAbi: string) => sdk.getEventLogs({ chain: CHAIN.HYPERLIQUID, target: EXCHANGE, fromBlock, toBlock, eventAbi, onlyArgs: true });
  const closes = sumFees(await getLogs(POSITIONS_CLOSED));
  const liquidations = sumFees(await getLogs(LIQUIDATED));
  const { traderPnl, stakingRewards } = await getProtocolWindowDeltas(options, ["traderPnl", "stakingRewards"], ["traderPnl"]);

  const houseIncome = -traderPnl; // traders' net realized loss after fees, negative when traders net win
  const fees = closes.staker + closes.dev + liquidations.staker + liquidations.dev;
  const stakerFees = closes.staker + liquidations.staker;
  const devFees = closes.dev + liquidations.dev;
  const lpSurplusToStakers = stakingRewards - stakerFees; // sweeps above the cap; both counters accrue on settlement
  if (lpSurplusToStakers < -1) throw new Error(`papertrade: staker distributions ${stakingRewards} below the event staker fees ${stakerFees} for ${options.dateString}`);
  const retainedInLp = houseIncome - fees - Math.max(lpSurplusToStakers, 0);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addUSDValue(closes.staker + closes.dev, METRIC.TRADING_FEES);
  dailyFees.addUSDValue(liquidations.staker + liquidations.dev, METRIC.LIQUIDATION_FEES);
  dailyFees.addUSDValue(houseIncome - fees, "House PnL");
  dailyHoldersRevenue.addUSDValue(closes.staker, "Trading Fees To PAPER Stakers");
  dailyHoldersRevenue.addUSDValue(liquidations.staker, "Liquidation Fees To PAPER Stakers");
  dailyHoldersRevenue.addUSDValue(Math.max(lpSurplusToStakers, 0), "LP Surplus To PAPER Stakers");
  dailyProtocolRevenue.addUSDValue(closes.dev, "Trading Fees To Dev Fee Recipient");
  dailyProtocolRevenue.addUSDValue(liquidations.dev, "Liquidation Fees To Dev Fee Recipient");
  dailyProtocolRevenue.addUSDValue(retainedInLp, "House PnL Retained In LP");
  dailyRevenue.addBalances(dailyHoldersRevenue);
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-10-10", // public launch
  allowNegativeValue: true, // the house loses when traders net win in a window; the LP then shrinks and protocol revenue is negative
  methodology: {
    Fees: "Papertrade's gross income as the house: traders' net realized losses on BTC and ETH positions settled against the protocol-owned LP, including the 2% fee on realized PnL at close and the 2% fee on margin lost in liquidations. Negative when traders net win. Unrealized PnL on open positions is not counted.",
    Revenue: "All of the house income. There are no external liquidity providers: it is split between PAPER stakers, the dev fee recipient and the LP itself.",
    ProtocolRevenue: "The half of close and liquidation fees credited to the dev fee recipient, plus house PnL retained in the protocol-owned LP (the LP keeps gains up to its $5M staker reward cap and absorbs losses, so this can be negative).",
    HoldersRevenue: "USDC credited to PAPER stakers: half of close and liquidation fees, plus 98% of LP gains above the $5M staker reward cap.",
    SupplySideRevenue: "Zero. Traders bet against the protocol-owned LP, which has no outside depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% of realized PnL on closed positions: the win fee on profitable closes plus the LP-side fee on losing closes.",
      [METRIC.LIQUIDATION_FEES]: "2% of the margin lost on liquidated positions.",
      "House PnL": "Traders' net realized losses beyond the explicit fees, kept by the protocol-owned LP or swept to stakers. Negative when traders net win.",
    },
    Revenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee on closes, credited in USDC to PAPER stakers.",
      "Liquidation Fees To PAPER Stakers": "Half of the 2% liquidation fee, credited in USDC to PAPER stakers.",
      "LP Surplus To PAPER Stakers": "98% of LP gains above the $5M staker reward cap, credited in USDC to PAPER stakers.",
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee on closes, claimable by the dev fee recipient set by the contract owner.",
      "Liquidation Fees To Dev Fee Recipient": "Half of the 2% liquidation fee, claimable by the dev fee recipient set by the contract owner.",
      "House PnL Retained In LP": "House PnL kept in the protocol-owned LP after fees and staker sweeps. Negative when traders net win.",
    },
    ProtocolRevenue: {
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee on closes, claimable by the dev fee recipient set by the contract owner.",
      "Liquidation Fees To Dev Fee Recipient": "Half of the 2% liquidation fee, claimable by the dev fee recipient set by the contract owner.",
      "House PnL Retained In LP": "House PnL kept in the protocol-owned LP after fees and staker sweeps. Negative when traders net win.",
    },
    HoldersRevenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee on closes, credited in USDC to PAPER stakers.",
      "Liquidation Fees To PAPER Stakers": "Half of the 2% liquidation fee, credited in USDC to PAPER stakers.",
      "LP Surplus To PAPER Stakers": "98% of LP gains above the $5M staker reward cap, credited in USDC to PAPER stakers.",
    },
  },
};

export default adapter;
