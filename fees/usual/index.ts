import { Adapter, FetchOptions, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";
import { queryDune } from "../../helpers/dune";

type IResponse = {
  balance: string;
  balance_usd: number;
  cumulative_daily_revenue: number;
  daily_revenue: number;
  day: string;
  price: number;
};

const DUNE_QUERY_ID = "3868036";

const formatDay = (day: string): string => day.split(" ")[0];

const formatTimestampToISO = (timestamp: number | string): string => {
  const date = new Date(Number(timestamp) * 1000);
  return date.toISOString().split("T")[0];
};

const fetch = async (
  timestamp: number,
  _: any,
  { createBalances }: FetchOptions
): Promise<FetchResultFees> => {
  const dailyRevenue = createBalances();
  const totalRevenue = createBalances();

  const isoTimestamp = formatTimestampToISO(timestamp);
  const rawResult: IResponse[] = await queryDune(DUNE_QUERY_ID);
  const results = rawResult.map((r) => ({ ...r, day: formatDay(r.day) }));

  const fees = results.find(({ day }) => day === isoTimestamp)?.daily_revenue;
  const cumulativeFees = results[0]?.cumulative_daily_revenue;

  if (fees) dailyRevenue.add(ADDRESSES.ethereum.USDC, Math.round(fees) * 1e6);
  totalRevenue.add(ADDRESSES.ethereum.USDC, Math.round(cumulativeFees) * 1e6);

  return { timestamp, dailyRevenue, totalRevenue };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: 1716508800,
      runAtCurrTime: false,
    },
  },
};

export default adapter;
