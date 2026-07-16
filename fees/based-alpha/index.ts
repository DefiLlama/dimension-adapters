import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const LAUNCHPAD = "0x5640c62fe43a64f9ae0811114874e95a819db744";

const TRADE_EVENT =
  "event Trade(address indexed token, address indexed trader, bool isBuy, uint256 ethAmount, uint256 tokenAmount, uint256 protocolFee, uint256 creatorFee, uint256 virtualEth, uint256 virtualToken, uint256 tokensSold)";
const MIGRATED_EVENT =
  "event Migrated(address indexed token, address indexed pool, uint256 ethAdded, uint256 tokensAdded, uint256 migrationFee)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const tradeLogs = await options.getLogs({ target: LAUNCHPAD, eventAbi: TRADE_EVENT });
  for (const log of tradeLogs) {
    // ethAmount is the net curve-side amount only. Verified on-chain via two
    // buys and one sell: on a buy, tx.value = ethAmount + protocolFee + creatorFee
    // (confirmed exactly, twice); on a sell, the trader's payout equals ethAmount
    // exactly with no fee deducted from it. So the true gross notional on both
    // sides is ethAmount + protocolFee + creatorFee, not ethAmount alone.
    const totalFee = log.protocolFee + log.creatorFee;
    dailyVolume.addGasToken(log.ethAmount + totalFee);
    dailyFees.addGasToken(totalFee, METRIC.TRADING_FEES);
    dailyRevenue.addGasToken(log.protocolFee, "Trading Fees to Protocol");
    dailySupplySideRevenue.addGasToken(log.creatorFee, 'Trading Fees to Creators');
  }

  const migrationLogs = await options.getLogs({ target: LAUNCHPAD, eventAbi: MIGRATED_EVENT });
  for (const log of migrationLogs) {
    dailyFees.addGasToken(log.migrationFee, 'Migration Fees');
    dailyRevenue.addGasToken(log.migrationFee, 'Migration Fees to Protocol');
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross ETH notional of every bonding-curve buy and sell on the launchpad, including fees.",
  Fees: "1.25% trade fee (0.95% protocol + 0.30% creator) on every curve trade, plus the flat migration fee skimmed when a token graduates to Based DEX.",
  Revenue: "Protocol share of trade fees (0.95% of each trade) plus migration fees.",
  ProtocolRevenue: "Same as Revenue — all protocol fees(0.95% of each trade) and migration fees accrue to the protocol.",
  SupplySideRevenue: "Creator share of trade fees (0.30%), claimable by each token's creator.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: "1.25% trade fee (0.95% protocol + 0.30% creator) on every curve trade",
    'Migration Fees': "Flat migration fee skimmed when a token graduates to Based DEX",
  },
  Revenue: {
    'Trading Fees to Protocol': "Protocol share of trade fees (0.95% of each trade)",
    "Migration Fees to Protocol": "All the migration fees go to the protocol",
  },
  SupplySideRevenue: {
    'Trading Fees to Creators': "Creator share of trade fees (0.30% of each trade)",
  },
  ProtocolRevenue: {
    'Trading Fees to Protocol': "Protocol share of trade fees (0.95% of each trade)",
    "Migration Fees to Protocol": "All the migration fees go to the protocol",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-07-14",
  chains: [CHAIN.ROBINHOOD],
  methodology,
  breakdownMethodology,
};

export default adapter;
