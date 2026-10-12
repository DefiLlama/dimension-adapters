import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getBlock } from "../helpers/getBlock";
import { METRIC } from "../helpers/metrics";
import { getProtocolWindowDeltas } from "../helpers/papertrade";

// Papertrade is a house: every position is a bet against the protocol-owned LP. The LP has no depositors and no owner,
// it only pays winners, so its own gains and losses are not counted. What is counted is what leaves it: the 2% fee on
// realized PnL at close and on margin lost in liquidations (half to PAPER stakers, half to the dev fee recipient), and
// the LP gains above the $5M tracked-LP cap, which are swept in full to stakers (https://docs.papertrade.xyz/#/paper/staking).
const EXCHANGE = "0x6cd5661646289fb6e65ea5c032310fded797d0a2"; // HyperEVM
const POSITIONS_CLOSED = "event PositionsClosed(address indexed user, uint256 marginReturned, uint256 balanceAfter, uint256 stakerFee, uint256 devFee)";
const LIQUIDATED = "event Liquidated(uint256 indexed positionId, address indexed user, uint64 markPrice, uint64 bustPrice, bool fromQueuedBalance, uint256 stakerFee, uint256 devFee)";
const usd = (x: bigint) => Number(x / 10n ** 12n) / 1e6; // fee words are USD with 18 decimals

const sumFees = (logs: any[]) => logs.reduce((acc, log) => ({ staker: acc.staker + usd(BigInt(log.stakerFee)), dev: acc.dev + usd(BigInt(log.devFee)) }), { staker: 0, dev: 0 });

const fetch = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = await Promise.all([getBlock(options.fromTimestamp, CHAIN.HYPERLIQUID), getBlock(options.toTimestamp, CHAIN.HYPERLIQUID)]);
  const getLogs = (eventAbi: string) => sdk.getEventLogs({ chain: CHAIN.HYPERLIQUID, target: EXCHANGE, fromBlock, toBlock, eventAbi, onlyArgs: true });
  const closes = sumFees(await getLogs(POSITIONS_CLOSED));
  const liquidations = sumFees(await getLogs(LIQUIDATED));
  // stakingRewards = staker fee half + LP sweeps; it can lag the fee events within an hour
  const { stakingRewards } = await getProtocolWindowDeltas(options, ["stakingRewards"]);
  const lpSweeps = stakingRewards - closes.staker - liquidations.staker;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  dailyFees.addUSDValue(closes.staker + closes.dev, METRIC.TRADING_FEES);
  dailyFees.addUSDValue(liquidations.staker + liquidations.dev, METRIC.LIQUIDATION_FEES);
  dailyFees.addUSDValue(lpSweeps, "LP Surplus");
  dailyHoldersRevenue.addUSDValue(stakingRewards, "Distributions To PAPER Stakers");
  dailyProtocolRevenue.addUSDValue(closes.dev, "Trading Fees To Dev Fee Recipient");
  dailyProtocolRevenue.addUSDValue(liquidations.dev, "Liquidation Fees To Dev Fee Recipient");
  dailyRevenue.addBalances(dailyHoldersRevenue);
  dailyRevenue.addBalances(dailyProtocolRevenue);

  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-10-09",
  methodology: {
    Fees: "The 2% fee on realized PnL when BTC and ETH positions close, the 2% fee on margin lost in liquidations, and the LP gains above the $5M cap that are swept to PAPER stakers. Trader losses that stay in the protocol-owned LP below the cap are not counted, and neither are trader wins: the LP has no owner and only pays winners, queueing them when it runs dry.",
    Revenue: "All counted fees: the 2% close and liquidation fees, split half to PAPER stakers and half to the dev fee recipient, plus the LP gains above the $5M cap swept to PAPER stakers.",
    ProtocolRevenue: "The half of the 2% close and liquidation fees credited to the dev fee recipient.",
    HoldersRevenue: "USDC credited to PAPER stakers: half of the 2% close and liquidation fees, plus all LP gains above the $5M cap.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "2% of realized PnL on closed positions: the win fee on profitable closes plus the LP-side fee on losing closes.",
      [METRIC.LIQUIDATION_FEES]: "2% of the margin lost on liquidated positions.",
      "LP Surplus": "LP gains above the $5M cap, swept in full to PAPER stakers.",
    },
    Revenue: {
      "Distributions To PAPER Stakers": "USDC credited to PAPER stakers: half of the 2% close and liquidation fees plus all LP gains above the $5M cap.",
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee on closes.",
      "Liquidation Fees To Dev Fee Recipient": "Half of the 2% liquidation fee.",
    },
    ProtocolRevenue: {
      "Trading Fees To Dev Fee Recipient": "Half of the 2% PnL fee on closes.",
      "Liquidation Fees To Dev Fee Recipient": "Half of the 2% liquidation fee.",
    },
    HoldersRevenue: {
      "Distributions To PAPER Stakers": "USDC credited to PAPER stakers: half of the 2% close and liquidation fees plus all LP gains above the $5M cap.",
    },
  },
};

export default adapter;
