import axios from "axios";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ANALYTICS_API_ENDPOINT = 'https://analytics.indigoprotocol.io';

const INDY_TOKEN = '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0494e4459';
const IUSD_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344';
const IBTC_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069425443';
const IETH_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069455448';
const ISOL_TOKEN = 'f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069534f4c';

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  // Fees are: Liquidations, Payments to Treasury, and CDP Payments to INDY Stakers.
  // Revenue is Fees minus Liquidations.

  // Liquidations: the total amount of ADA sent to Stability Pool providers for a liquidation.
  const liquidationsResponse = await axios.get(
    ANALYTICS_API_ENDPOINT + `/api/revenue/liquidations?totals&from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );

  const totalLovelaceLiquidations = Number(liquidationsResponse.data.totals['lovelace'] ?? 0);

  // Collector Flows are all fees that are sent to INDY stakers: 
  // CDP Mint Fees, (partially) CDP Interest Payments, and Redemption Fees.
  const collectorFlowResponse = await axios.get(
    ANALYTICS_API_ENDPOINT + `/api/revenue/collector-flows?totals&inflows_only&from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const totalLovelaceToIndyStakers = Number(collectorFlowResponse.data.totals['lovelace'] ?? 0);

  // Treasury captures the following assets: ADA, INDY, iUSD, iBTC, iETH, and iSOL.
  // This collects: CDP Interest Payments (to treasury), INDY returned from emissions, and buybacks.
  const flowsResponse = await axios.get(
    ANALYTICS_API_ENDPOINT + `/api/revenue/flows?totals&inflows_only&from=${options.startTimestamp}&to=${options.endTimestamp}`,
  );
  const totalLovelaceTreasuryInflows = Number(flowsResponse.data.totals['lovelace'] ?? 0);


  const dailyFeesUSD = options.createBalances();
  dailyFeesUSD.addCGToken('cardano', (totalLovelaceTreasuryInflows + totalLovelaceToIndyStakers + totalLovelaceLiquidations) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol', Number(flowsResponse.data.totals[INDY_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-iusd', Number(flowsResponse.data.totals[IUSD_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-ibtc', Number(flowsResponse.data.totals[IBTC_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-ieth', Number(flowsResponse.data.totals[IETH_TOKEN] ?? 0) / 1_000_000);
  dailyFeesUSD.addCGToken('indigo-protocol-isol', Number(flowsResponse.data.totals[ISOL_TOKEN] ?? 0) / 1_000_000);


  const dailyRevenueUSD = options.createBalances();
  dailyRevenueUSD.addCGToken('cardano', (totalLovelaceTreasuryInflows + totalLovelaceToIndyStakers) / 1_000_000);
  dailyRevenueUSD.addCGToken('indigo-protocol', Number(flowsResponse.data.totals[INDY_TOKEN] ?? 0) / 1_000_000);
  dailyRevenueUSD.addCGToken('indigo-protocol-iusd', Number(flowsResponse.data.totals[IUSD_TOKEN] ?? 0) / 1_000_000);
  dailyRevenueUSD.addCGToken('indigo-protocol-ibtc', Number(flowsResponse.data.totals[IBTC_TOKEN] ?? 0) / 1_000_000);
  dailyRevenueUSD.addCGToken('indigo-protocol-ieth', Number(flowsResponse.data.totals[IETH_TOKEN] ?? 0) / 1_000_000);
  dailyRevenueUSD.addCGToken('indigo-protocol-isol', Number(flowsResponse.data.totals[ISOL_TOKEN] ?? 0) / 1_000_000);

  const dailyProtocolRevenueUSD = options.createBalances();
  dailyProtocolRevenueUSD.addCGToken('cardano', (totalLovelaceTreasuryInflows) / 1_000_000);
  dailyProtocolRevenueUSD.addCGToken('indigo-protocol', Number(flowsResponse.data.totals[INDY_TOKEN] ?? 0) / 1_000_000);
  dailyProtocolRevenueUSD.addCGToken('indigo-protocol-iusd', Number(flowsResponse.data.totals[IUSD_TOKEN] ?? 0) / 1_000_000);
  dailyProtocolRevenueUSD.addCGToken('indigo-protocol-ibtc', Number(flowsResponse.data.totals[IBTC_TOKEN] ?? 0) / 1_000_000);
  dailyProtocolRevenueUSD.addCGToken('indigo-protocol-ieth', Number(flowsResponse.data.totals[IETH_TOKEN] ?? 0) / 1_000_000);
  dailyProtocolRevenueUSD.addCGToken('indigo-protocol-isol', Number(flowsResponse.data.totals[ISOL_TOKEN] ?? 0) / 1_000_000);


  const dailyHoldersRevenueUSD = options.createBalances();
  dailyHoldersRevenueUSD.addCGToken('cardano', (totalLovelaceToIndyStakers) / 1_000_000);

  return {
    timestamp: options.startOfDay,
    dailyFees: dailyFeesUSD,
    dailyRevenue: dailyRevenueUSD,
    dailyProtocolRevenue: dailyProtocolRevenueUSD,
    dailyHoldersRevenue: dailyHoldersRevenueUSD,
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2022-11-22',
    },
  },
  methodology: {
    Fees: "Fees are: Liquidations, Payments to Treasury, and CDP Payments to INDY Stakers.",
    Revenue: "Revenue is: Payments to Treasury, and CDP Payments to INDY Stakers.",
  }
};

export default adapter;
