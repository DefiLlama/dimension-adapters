import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { SUILEND_API_ENDPOINT, SuiLendMetrics } from "../suilend";

const suilendDailyFeesURL = (dayTimestamp: number) =>
  `${SUILEND_API_ENDPOINT}/steamm/daily/fees?ts=${dayTimestamp}`;

interface DailyFees {
  protocolFeesUsd: string;
  poolFeesUsd: string;
}

const fetchSteammStats = async ({ startOfDay, createBalances }: FetchOptions) => {
  const stats: DailyFees = await fetchURL(suilendDailyFeesURL(startOfDay));

  // The two figures are disjoint halves of the swap fee, not a total and a
  // share of it: on-chain, `amount_out_net = amount_out - protocol_fees -
  // pool_fees`. Total fees are therefore their sum.
  const protocolRevenue = Number(stats.protocolFeesUsd);
  const supplySideRevenue = Number(stats.poolFeesUsd);

  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  dailyFees.addUSDValue(protocolRevenue + supplySideRevenue, SuiLendMetrics.SteammSwapFees);
  dailySupplySideRevenue.addUSDValue(supplySideRevenue, SuiLendMetrics.SteammSwapFeesToLPs);
  dailyRevenue.addUSDValue(protocolRevenue, SuiLendMetrics.SteammSwapFeesToProtocol);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  // The endpoint aggregates per UTC day and ignores any finer timestamp, so all
  // 24 hourly slots would return the same daily total and sum to 24x the real
  // figure.
  pullHourly: false,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSteammStats,
      start: "2025-02-16",
    },
  },
  methodology: {
    Fees: "Total fees paid from swaps",
    Revenue: "The portion of the total fees going to the STEAMM treasury",
    ProtocolRevenue: "The portion of the total fees going to the STEAMM treasury",
    SupplySideRevenue: "The portion of the total fees going to LPs",
  },
  breakdownMethodology: {
    Fees: {
      [SuiLendMetrics.SteammSwapFees]: 'Total swap fees paid by users',
    },
    Revenue: {
      [SuiLendMetrics.SteammSwapFeesToProtocol]: 'The portion of the total fees going to the STEAMM treasury',
    },
    SupplySideRevenue: {
      [SuiLendMetrics.SteammSwapFeesToLPs]: 'The portion of the total fees going to LPs',
    },
  }
};

export default adapter;
