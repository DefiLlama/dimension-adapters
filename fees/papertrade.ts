import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { METRIC } from "../helpers/metrics";

// The only fee is 2% of realized PnL (win fee on gains after the impact haircut, LP-side fee on losses), half to PAPER
// stakers and half to the dev fee recipient (https://docs.papertrade.xyz/#/paper/staking). The Exchange emits both
// halves per settled close in PositionsClosed (source unverified; the signature resolves from the bytecode and the two
// fee words reconcile 1:1 with each other and with 2% of the PositionClosed PnL word). Liquidations emit Liquidated
// without a fee word; their 2% of lost margin is immaterial (under 0.1% of close fees on launch day) and excluded.
// The stats API's stakingRewards counter is NOT usable for fees: it also carries LP surplus swept to stakers.
const EXCHANGE = "0x6cd5661646289fb6e65ea5c032310fded797d0a2"; // HyperEVM proxy, impl 0x0f3febfc94876b0c895f7acecdc8f5c863b549ee
// word names for the first two values are inferred (margin returned, balance after); only the fee words are used
const POSITIONS_CLOSED = "event PositionsClosed(address indexed user, uint256 marginReturned, uint256 balanceAfter, uint256 stakerFee, uint256 devFee)";
const usd = (x: bigint) => Number(x / 10n ** 12n) / 1e6; // fee words are USD with 18 decimals

const fetch = async (options: FetchOptions) => {
  // listed under off_chain (synthetic bets against the house), the contract itself lives on HyperEVM
  const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.HYPERLIQUID), getBlock(options.toTimestamp, CHAIN.HYPERLIQUID)]);
  const logs = await sdk.getEventLogs({ chain: CHAIN.HYPERLIQUID, target: EXCHANGE, fromBlock, toBlock, eventAbi: POSITIONS_CLOSED, onlyArgs: true });
  let stakerFees = 0n;
  let devFees = 0n;
  for (const log of logs as any[]) {
    stakerFees += BigInt(log.stakerFee);
    devFees += BigInt(log.devFee);
  }

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addUSDValue(usd(stakerFees + devFees), METRIC.TRADING_FEES);
  dailyRevenue.addUSDValue(usd(stakerFees), "Trading Fees To PAPER Stakers");
  dailyRevenue.addUSDValue(usd(devFees), "Trading Fees To Dev Fee Recipient");
  dailyHoldersRevenue.addUSDValue(usd(stakerFees), "Trading Fees To PAPER Stakers");
  dailyProtocolRevenue.addUSDValue(usd(devFees), "Trading Fees To Dev Fee Recipient");

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue: 0 };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-10-10", // public launch
  methodology: {
    Fees: "The 2% fee Papertrade takes on realized trading PnL when a position is closed: a win fee on the gain of profitable closes and a fee carved from the LP's gain on losing closes, read from the exchange contract's own close events. Excludes the asymmetric-impact haircut and trader losses kept by the protocol-owned LP, LP surplus paid to stakers above the $5M LP cap, and the 2% liquidation fee on lost margin.",
    Revenue: "All of the 2% PnL fee. There are no external liquidity providers: half goes to PAPER stakers and half to the dev fee recipient.",
    ProtocolRevenue: "The half of the 2% PnL fee credited to the dev fee recipient.",
    HoldersRevenue: "The half of the 2% PnL fee credited in USDC to PAPER stakers.",
    SupplySideRevenue: "Zero. Traders bet against the protocol-owned LP, which has no outside depositors.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% of realized PnL on closed positions: the win fee on profitable closes plus the LP-side fee on losing closes.",
    },
    Revenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee, credited in USDC to PAPER stakers.",
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee, claimable by the dev fee recipient set by the contract owner.",
    },
    ProtocolRevenue: {
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee, claimable by the dev fee recipient set by the contract owner.",
    },
    HoldersRevenue: {
      "Trading Fees To PAPER Stakers": "Half of the 2% PnL fee, credited in USDC to PAPER stakers.",
    },
  },
};

export default adapter;
