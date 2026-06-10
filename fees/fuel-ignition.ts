import { SimpleAdapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpPost } from "../utils/fetchURL";

const EXPLORER_URL = "https://explorer-indexer-mainnet.fuel.network/graphql";

const methodology = {
  Fees: "Total gas fees paid by users on the Fuel Ignition network.",
  Revenue:
    "Gas fees retained by the Fuel sequencer. Fuel migrated data availability from Ethereum blobs to EigenDA in July 2025. EigenDA costs are settled via prepaid PaymentVault deposits and off-chain per-blob metering, so there is no public per-rollup daily DA cost to net out as supply-side revenue. If a public EigenDA cost source becomes available, it can be added as dailySupplySideRevenue.",
};

const breakdownMethodology = {
  Fees: {
    "Gas Fees": "Gas fees paid by users for transactions on Fuel Ignition.",
  },
  Revenue: {
    "Gas Fees To Sequencer": "Gas fees retained by the Fuel sequencer.",
  },
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  const dataResponse = await httpPost(EXPLORER_URL, {
    query: `
      query statistics {
        statistics {
          nodes {
            totalFee {
              date
              value
              valueInUsd
            }
          }
        }
      }
    `
  }, {
    headers: {
      authorization: 'Basic ZnVlbGRldjE6MXBkZGtp' + 'WGhMYlZESW1DZG1UNUhhdw==',
      'x-api-key': 'Bearer nZ9GZ' + 'ayrd8',
    }
  });

  let totalGasSpent = 0;
  for (const item of dataResponse.data.statistics.nodes.totalFee) {
    totalGasSpent += Number(item.value);
  }

  // Total gas spent in ETH, numbers are in 9 decimals.
  dailyFees.addCGToken('ethereum', totalGasSpent / 1e9, "Gas Fees");
  // All gas fees are retained by the sequencer. Fuel moved DA from Ethereum
  // blobs to EigenDA in July 2025, and EigenDA cost is not publicly sourceable
  // per rollup/day, so there is no supply-side DA cost to subtract here.
  dailyRevenue.addCGToken('ethereum', totalGasSpent / 1e9, "Gas Fees To Sequencer");

  return {
    dailyFees,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  runAtCurrTime: true,
  fetch,
  chains: [CHAIN.FUEL],
  start: '2024-11-01',
  protocolType: ProtocolType.CHAIN,
  methodology,
  breakdownMethodology,
};

export default adapter;
