import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { COSMOS_CHAIN_METRIC_CONFIGS, fetchCosmosChainMetrics, GAS_FEES_TO_VALIDATORS_LABEL, getBlockRangeForTimestamps } from "../helpers/cosmosChainFees";
import { METRIC } from "../helpers/metrics";
import fetchURL from "../utils/fetchURL";

const config = COSMOS_CHAIN_METRIC_CONFIGS.osmosis;

// numia computes swap/taker fees, which do not exist at the raw-transaction level
const numiaFeesEndpoint = "https://public-osmosis-api.numia.xyz/external/defillama/chain_fees_and_revenue";

const SWAP_FEES_TO_LPS_LABEL = "Token Swap Fees To LPs";
const TAKER_FEES_LABEL = "Taker Fees";

interface INumiaDay {
  timestamp: string;
  dailyFees: number;
  dailyRevenue: number;
}

const methodology = {
  Fees: "Swap fees paid by traders to liquidity pools plus transaction gas fees paid by users.",
  Revenue: "Taker fees collected by the protocol.",
  SupplySideRevenue: "Swap fees distributed to liquidity providers and gas fees distributed to validators and delegators.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap and taker fees paid by traders, as computed by Numia.",
    [METRIC.TRANSACTION_GAS_FEES]: "Sum of the fee declared by every transaction in the day's block range, read from tx_search fee events.",
  },
  Revenue: {
    [TAKER_FEES_LABEL]: "Taker fees collected by the protocol, as computed by Numia.",
  },
  SupplySideRevenue: {
    [SWAP_FEES_TO_LPS_LABEL]: "Swap fees minus the protocol taker fees, distributed to liquidity providers.",
    [GAS_FEES_TO_VALIDATORS_LABEL]: "All transaction gas fees are distributed to validators and delegators.",
  },
};

const fetch = async (options: FetchOptions) => {
  const { fromBlock, toBlock } = await getBlockRangeForTimestamps(config, options.startTimestamp, options.endTimestamp);
  const metrics = await fetchCosmosChainMetrics({ ...config, fromBlock, toBlock });

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const [denom, amount] of Object.entries(metrics.feesByDenom)) {
    const denomConfig = config.denoms[denom];
    if (!denomConfig) continue;
    dailyFees.addCGToken(denomConfig.cgToken, amount / 10 ** denomConfig.decimals, METRIC.TRANSACTION_GAS_FEES);
    dailySupplySideRevenue.addCGToken(denomConfig.cgToken, amount / 10 ** denomConfig.decimals, GAS_FEES_TO_VALIDATORS_LABEL);
  }

  const historicalFees: INumiaDay[] = await fetchURL(numiaFeesEndpoint);
  const dayData = historicalFees.find((item) => item.timestamp.split(" ")[0] === options.dateString);
  if (!dayData) throw new Error(`No numia fee data found for ${options.dateString}`);
  dailyFees.addUSDValue(dayData.dailyFees, METRIC.SWAP_FEES);
  dailyRevenue.addUSDValue(dayData.dailyRevenue, TAKER_FEES_LABEL);
  dailySupplySideRevenue.addUSDValue(dayData.dailyFees - dayData.dailyRevenue, SWAP_FEES_TO_LPS_LABEL);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyTransactionsCount: metrics.transactionCount,
    dailyGasUsed: metrics.totalGasUsed,
  };
};

const adapter: SimpleAdapter = {
  // version 1: numia only returns daily aggregates, so hourly v2 runs would re-add
  // the full day's swap fees every hour
  version: 1,
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true,
  chains: [CHAIN.COSMOS],
  start: "2022-04-15",
  methodology,
  breakdownMethodology,
  fetch,
};

export default adapter;
