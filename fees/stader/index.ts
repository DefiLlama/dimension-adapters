import {
  Adapter,
  Fetch,
  FetchOptions,
  FetchResultFees,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

type IMainnetResponse = {
  month: string;
  monthly_operator_reward: number;
  monthly_stader_revenue: number;
  monthly_user_reward: number;
};

type IAltResponse = {
  month: string;
  monthly_stader_revenue: number;
  monthly_supply_side_fee: number;
};

const DUNE_QUERY: { [key: string]: string } = {
  ethereum: "3376313",
  polygon: "3376354",
  bsc: "3376374",
};

const formatDay = (date: string): string => date.split(" ")[0];

const formatTimestampToISO = (timestamp: number | string): string => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString().split("T")[0];
};

const fetchOnEthereum = async (
  timestamp: number,
  _: any,
  {}: FetchOptions,
  query: string
): Promise<FetchResultFees> => {
  const isoTimestamp = formatTimestampToISO(timestamp);
  const rawResult: IMainnetResponse[] = await queryDune(query);
  const results = rawResult.map((r) => ({ ...r, month: formatDay(r.month) }));

  const relevantResults: IMainnetResponse | undefined = results.find(
    ({ month }) => { return month === isoTimestamp });

  if (!relevantResults) return { timestamp, dailyFees: 0, dailyRevenue: 0 };
  const { monthly_operator_reward, monthly_stader_revenue, monthly_user_reward } = relevantResults;
  const monthlyRevenues = monthly_stader_revenue;
  const monthlyFees = monthly_operator_reward + monthly_stader_revenue + monthly_user_reward;

  return {
    timestamp,
    dailyFees: monthlyFees / 30,
    dailyRevenue: monthlyRevenues / 30,
  };
};

const fetchOnAltChains = async (
  timestamp: number,
  _: any,
  {}: FetchOptions,
  query: string
): Promise<FetchResultFees> => {
  const isoTimestamp = formatTimestampToISO(timestamp);
  const rawResult: IAltResponse[] = await queryDune(query);

  const results = rawResult.map((r) => ({ ...r, month: formatDay(r.month) }));

  const relevantResults: IAltResponse | undefined = results.find(
    ({ month }) => { return month === isoTimestamp });

  if (!relevantResults) return { timestamp, dailyFees: 0, dailyRevenue: 0 };
  const { monthly_stader_revenue, monthly_supply_side_fee } = relevantResults;

  return {
    timestamp,
    dailyFees: monthly_supply_side_fee / 30,
    dailyRevenue: monthly_stader_revenue / 30,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: (...args: Parameters<Fetch>) =>
        fetchOnEthereum(...args, DUNE_QUERY[CHAIN.ETHEREUM]),
      start: 1685577600,
      runAtCurrTime: false,
    },
    [CHAIN.POLYGON]: {
      fetch: (...args: Parameters<Fetch>) =>
        fetchOnAltChains(...args, DUNE_QUERY[CHAIN.POLYGON]),
      start: 1659312000,
    },
    [CHAIN.BSC]: {
      fetch: (...args: Parameters<Fetch>) =>
        fetchOnAltChains(...args, DUNE_QUERY[CHAIN.BSC]),
      start: 1675209600,
    },
  },
};

export default adapter;
