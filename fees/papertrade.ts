import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { METRIC } from "../helpers/metrics";

// The only fees are 2% of realized PnL on closes (win fee on gains after the impact haircut, LP-side fee on losses) and
// 2% of the lost margin on liquidations, each split half to PAPER stakers and half to the dev fee recipient
// (https://docs.papertrade.xyz/#/paper/staking). The Exchange emits both halves per settlement: PositionsClosed for
// closes and Liquidated for liquidations (source unverified; signatures resolve from the bytecode, and the summed dev
// words reconcile to the cent with devFeeAccumulator plus DevFeesClaimed on launch day).
// The stats API's stakingRewards counter is NOT usable for fees: it also carries LP surplus swept to stakers.
const EXCHANGE = "0x6cd5661646289fb6e65ea5c032310fded797d0a2"; // HyperEVM proxy, impl 0x0f3febfc94876b0c895f7acecdc8f5c863b549ee
// non-fee word names are inferred; only the fee words are used
const POSITIONS_CLOSED = "event PositionsClosed(address indexed user, uint256 marginReturned, uint256 balanceAfter, uint256 stakerFee, uint256 devFee)";
const LIQUIDATED = "event Liquidated(uint256 indexed positionId, address indexed user, uint64 markPrice, uint64 bustPrice, bool fromQueuedBalance, uint256 stakerFee, uint256 devFee)";
const usd = (x: bigint) => Number(x / 10n ** 12n) / 1e6; // fee words are USD with 18 decimals

const sumFees = (logs: any[]) => logs.reduce((acc, log) => ({ staker: acc.staker + BigInt(log.stakerFee), dev: acc.dev + BigInt(log.devFee) }), { staker: 0n, dev: 0n });

const fetch = async (options: FetchOptions) => {
  // listed under off_chain (synthetic bets against the house), the contract itself lives on HyperEVM
  const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.HYPERLIQUID), getBlock(options.toTimestamp, CHAIN.HYPERLIQUID)]);
  const getLogs = (eventAbi: string) => sdk.getEventLogs({ chain: CHAIN.HYPERLIQUID, target: EXCHANGE, fromBlock, toBlock, eventAbi, onlyArgs: true });
  const closes = sumFees(await getLogs(POSITIONS_CLOSED));
  const liquidations = sumFees(await getLogs(LIQUIDATED));

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addUSDValue(usd(closes.staker + closes.dev), METRIC.TRADING_FEES);
  dailyFees.addUSDValue(usd(liquidations.staker + liquidations.dev), METRIC.LIQUIDATION_FEES);
  dailyRevenue.addUSDValue(usd(closes.staker), "Trading Fees To PAPER Stakers");
  dailyRevenue.addUSDValue(usd(closes.dev), "Trading Fees To Dev Fee Recipient");
  dailyRevenue.addUSDValue(usd(liquidations.staker), "Liquidation Fees To PAPER Stakers");
  dailyRevenue.addUSDValue(usd(liquidations.dev), "Liquidation Fees To Dev Fee Recipient");
  dailyHoldersRevenue.addUSDValue(usd(closes.staker), "Trading Fees To PAPER Stakers");
  dailyHoldersRevenue.addUSDValue(usd(liquidations.staker), "Liquidation Fees To PAPER Stakers");
  dailyProtocolRevenue.addUSDValue(usd(closes.dev), "Trading Fees To Dev Fee Recipient");
  dailyProtocolRevenue.addUSDValue(usd(liquidations.dev), "Liquidation Fees To Dev Fee Recipient");

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-10-10", // public launch
  methodology: {
    Fees: "The 2% fee Papertrade takes on realized trading PnL when a position is closed (a win fee on the gain of profitable closes, a fee carved from the LP's gain on losing closes) plus the 2% fee on the margin lost in liquidations, read from the exchange contract's own settlement events. Excludes the asymmetric-impact haircut and trader losses kept by the protocol-owned LP, and LP surplus paid to stakers above the $5M LP cap.",
    Revenue: "All close and liquidation fees. There are no external liquidity providers: half goes to PAPER stakers and half to the dev fee recipient.",
    ProtocolRevenue: "The half of close and liquidation fees credited to the dev fee recipient.",
    HoldersRevenue: "The half of close and liquidation fees credited in USDC to PAPER stakers.",
    SupplySideRevenue: "Zero. Traders bet against the protocol-owned LP, which has no outside depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% of realized PnL on closed positions: the win fee on profitable closes plus the LP-side fee on losing closes.",
      [METRIC.LIQUIDATION_FEES]: "2% of the margin lost on liquidated positions.",
    },
    Revenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee on closes, credited in USDC to PAPER stakers.",
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee on closes, claimable by the dev fee recipient set by the contract owner.",
      "Liquidation Fees To PAPER Stakers": "Half of the 2% liquidation fee, credited in USDC to PAPER stakers.",
      "Liquidation Fees To Dev Fee Recipient": "Half of the 2% liquidation fee, claimable by the dev fee recipient set by the contract owner.",
    },
    ProtocolRevenue: {
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee on closes, claimable by the dev fee recipient set by the contract owner.",
      "Liquidation Fees To Dev Fee Recipient": "Half of the 2% liquidation fee, claimable by the dev fee recipient set by the contract owner.",
    },
    HoldersRevenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee on closes, credited in USDC to PAPER stakers.",
      "Liquidation Fees To PAPER Stakers": "Half of the 2% liquidation fee, credited in USDC to PAPER stakers.",
    },
  },
};

export default adapter;
