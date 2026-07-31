import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Sushi token launchpad on Robinhood Chain, deploys ERC-20s and opens their SushiSwap V3 pool.
// https://www.sushi.com/robinhood/launchpad
// https://docs.sushi.com/contracts/launchpad
const LAUNCHPAD = "0x104F1Ab42674565EC3DF0BFEbCcC4186f72fA7ED";

const FEES_DISTRIBUTED =
  "event FeesDistributed(address indexed caller, address indexed token, address indexed pool, address creator, address protocolRecipient, uint16 sushiFeeBps, uint256 quoteCollected, uint256 tokenCollected, uint256 quoteToSushi, uint256 tokenToSushi, uint256 quoteToCreator, uint256 tokenToCreator)";

const LAUNCH_FEES_WITHDRAWN =
  "event LaunchFeesWithdrawn(address indexed recipient, uint256 amount)";

async function fetch(options: FetchOptions) {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const [feeLogs, launchLogs] = await Promise.all([
    options.getLogs({ target: LAUNCHPAD, eventAbi: FEES_DISTRIBUTED }),
    options.getLogs({ target: LAUNCHPAD, eventAbi: LAUNCH_FEES_WITHDRAWN }),
  ]);

  for (const log of feeLogs) {
    dailyFees.addGasToken(log.quoteCollected, METRIC.TRADING_FEES);
    dailyFees.add(log.token, log.tokenCollected, METRIC.TRADING_FEES);

    dailyRevenue.addGasToken(log.quoteToSushi, METRIC.TRADING_FEES);
    dailyRevenue.add(log.token, log.tokenToSushi, METRIC.TRADING_FEES);

    dailySupplySideRevenue.addGasToken(log.quoteToCreator, "Creator Fees");
    dailySupplySideRevenue.add(log.token, log.tokenToCreator, "Creator Fees");
  }

  for (const log of launchLogs) {
    dailyFees.addGasToken(log.amount, "Launch Fees");
    dailyRevenue.addGasToken(log.amount, "Launch Fees");
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
}

const methodology = {
  Fees: "Accrued 1% SushiSwap V3 trading fees collected in launch token pools plus fixed ETH fees paid per token launch.",
  Revenue: "Sushi's 30% share of accrued V3 trading fees plus fixed ETH launch fees, which belong entirely to Sushi.",
  ProtocolRevenue: "Sushi's 30% share of accrued V3 trading fees plus fixed ETH launch fees, which belong entirely to Sushi.",
  SupplySideRevenue: "Token creator's 70% share of accrued V3 trading fees, distributed via FeesDistributed.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "Accrued 1% SushiSwap V3 trading fees collected in launch token pools, emitted as quoteCollected in FeesDistributed.",
    "Launch Fees": "Fixed ETH fee paid per new token launch; the full amount belongs to Sushi, emitted via LaunchFeesWithdrawn.",
  },
  Revenue: {
    [METRIC.TRADING_FEES]: "Sushi's 30% share of accrued V3 trading fees, emitted as quoteToSushi in FeesDistributed.",
    "Launch Fees": "Fixed ETH launch fee retained by Sushi, emitted via LaunchFeesWithdrawn.",
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: "Sushi's 30% share of accrued V3 trading fees, emitted as quoteToSushi in FeesDistributed.",
    "Launch Fees": "Fixed ETH launch fee retained by Sushi, emitted via LaunchFeesWithdrawn.",
  },
  SupplySideRevenue: {
    "Creator Fees": "Token creator's 70% share of accrued V3 trading fees, emitted as quoteToCreator in FeesDistributed.",
  },
};

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.ROBINHOOD],
  fetch,
  start: "2026-07-28",
  methodology,
  breakdownMethodology,
};

export default adapter;
