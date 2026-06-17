import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchTurboFlowMetrics, shouldReturnProtocolMetrics } from "../helpers/turboflow";

const METRICS = {
  flatFee: "Flat fee",
  profitShare: "Profit share",
  eventContractFee: "Event-contract fee",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (!shouldReturnProtocolMetrics(options)) {
    return {
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  }

  const metrics = await fetchTurboFlowMetrics(options);
  const feeComponents = [
    [METRICS.flatFee, metrics.flatFeesUsd],
    [METRICS.profitShare, metrics.profitShareFeesUsd],
    [METRICS.eventContractFee, metrics.eventContractsFeesUsd],
  ] as const;

  for (const [label, amount] of feeComponents) {
    dailyFees.addUSDValue(amount, label);
    dailyUserFees.addUSDValue(amount, label);
    dailyRevenue.addUSDValue(amount, label);
    dailyProtocolRevenue.addUSDValue(amount, label);
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: false,
  chains: [CHAIN.BSC, CHAIN.SOLANA],
  start: "2025-10-19",
  methodology: {
    Fees:
      "All fees paid by TurboFlow users. Composed of flat perp trading fees, perp profit-share fees, and event-contract fees. Football currently has no fees and is not exposed as a separate fee line.",
    UserFees:
      "Fees directly paid by users; identical to Fees for TurboFlow because all fees originate from end users.",
    Revenue:
      "All reported fees are retained as protocol revenue. TurboFlow currently has no LP, market-maker, referral, rebate, or token-holder revenue split.",
    ProtocolRevenue:
      "All reported revenue is protocol revenue. TurboFlow has no token-holder revenue.",
    SupplySideRevenue:
      "TurboFlow currently has no LP, market-maker, referral, rebate, or holder revenue split.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.flatFee]: "Flat trading fees on perpetual contracts.",
      [METRICS.profitShare]: "Profit-share fees collected on closed perpetual positions.",
      [METRICS.eventContractFee]: "Fees collected on event-contract prediction-market orders.",
    },
    UserFees: {
      [METRICS.flatFee]: "Flat trading fees paid by users on perpetual contracts.",
      [METRICS.profitShare]: "Profit-share fees paid by users on closed perpetual positions.",
      [METRICS.eventContractFee]: "Event-contract fees paid by users.",
    },
    Revenue: {
      [METRICS.flatFee]: "Flat perp fees retained as protocol revenue.",
      [METRICS.profitShare]: "Profit-share fees retained as protocol revenue.",
      [METRICS.eventContractFee]: "Event-contract fees retained as protocol revenue.",
    },
    ProtocolRevenue: {
      [METRICS.flatFee]: "Flat perp fees retained as protocol revenue.",
      [METRICS.profitShare]: "Profit-share fees retained as protocol revenue.",
      [METRICS.eventContractFee]: "Event-contract fees retained as protocol revenue.",
    },
  },
};

export default adapter;
