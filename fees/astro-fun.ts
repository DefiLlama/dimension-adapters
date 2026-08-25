import ADDRESSES from "../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Astro is a crash game. Every round is settled on-chain against the
// BankrollVault, which custodies the LP bankroll, the player balances and the
// stakes in play.
const BANKROLL_VAULT = "0x58D2f2D46af20C357885d540A9c02fDD791Ee1CF";

// Emitted once per settled round: the total staked by players and the total
// credited back to the winners. The difference is the house win for the round.
const ROUND_SETTLED =
  "event RoundSettled(uint256 totalBets, uint256 totalPayouts, uint256 newPoolAssets)";

// Emitted when a settlement leaves the vault share price above its high water
// mark. operatorFeeUSDC is the performance fee taken by the protocol on that
// gain (50% of the eligible profit, minted to the operator as vault shares).
const PROFIT_RECORDED =
  "event ProfitRecorded(uint256 grossProfit, uint256 operatorFeeUSDC, uint256 operatorSharesMinted, uint256 newHWM)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [settledLogs, profitLogs] = await Promise.all([
    options.getLogs({ targets: [BANKROLL_VAULT], eventAbi: ROUND_SETTLED }),
    options.getLogs({ targets: [BANKROLL_VAULT], eventAbi: PROFIT_RECORDED }),
  ]);

  // Gross gaming revenue: what players staked minus what they were paid out.
  let grossGamingRevenue = 0n;
  for (const log of settledLogs) {
    const totalBets: bigint = log.totalBets;
    const totalPayouts: bigint = log.totalPayouts;
    grossGamingRevenue += totalBets - totalPayouts;
  }

  // Protocol's cut, read from the events rather than assumed: the fee only
  // applies to profit above the vault's high water mark, so it is not a flat
  // share of the gross gaming revenue.
  let operatorFees = 0n;
  for (const log of profitLogs) {
    const operatorFeeUSDC: bigint = log.operatorFeeUSDC;
    operatorFees += operatorFeeUSDC;
  }

  dailyFees.add(ADDRESSES.robinhood.USDG, grossGamingRevenue, METRIC.PROTOCOL_FEES);
  dailyRevenue.add(ADDRESSES.robinhood.USDG, operatorFees, METRIC.PERFORMANCE_FEES);
  // Everything the protocol does not take stays in the bankroll and accrues to
  // the LPs through the ASTROLP share price. On a losing day this is negative:
  // the LPs, not the protocol, absorb the players' winnings.
  dailySupplySideRevenue.add(
    ADDRESSES.robinhood.USDG,
    grossGamingRevenue - operatorFees,
    METRIC.LP_FEES
  );

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-08-11", // BankrollVault deployment
  // The house can lose: on a day where players cash out more than they stake,
  // the gross gaming revenue and the LPs' share of it are both negative.
  allowNegativeValue: true,
  methodology: {
    Fees: "Gross gaming revenue: the total staked by players in settled rounds minus the total paid out to them.",
    Revenue: "Performance fee taken by the protocol on the bankroll's profit above its high water mark (50% of the eligible gain).",
    ProtocolRevenue: "All of the performance fee goes to the protocol operator.",
    SupplySideRevenue: "Gross gaming revenue left to the bankroll liquidity providers, accruing to the ASTROLP share price.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.PROTOCOL_FEES]: "Gross gaming revenue from settled crash rounds, in USDG.",
    },
    Revenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee on bankroll profit above the high water mark, minted to the operator as ASTROLP shares.",
    },
    SupplySideRevenue: {
      [METRIC.LP_FEES]: "Gross gaming revenue net of the performance fee, accruing to the bankroll liquidity providers.",
    },
    ProtocolRevenue: {
      [METRIC.PERFORMANCE_FEES]: "Performance fee on bankroll profit above the high water mark, minted to the operator as ASTROLP shares.",
    },
  },
};

export default adapter;
