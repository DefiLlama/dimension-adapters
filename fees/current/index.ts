import {
  Adapter,
  FetchResultV2,
  FetchV2,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const dailyFeesApiURL = "https://xxx.current.finance/api/statistic/daily-fees";

interface DailyFeesApiResponse {
  code: number;
  message: string;
  data: {
    totalRevenue: string;
    supplySideRevenue: string;
    fee: string;
  };
}

const methodology = {
  Fees: 'Total borrow fees, flash loan fees, and liquidation fees paid by borrowers and the liquidated',
  ProtocolRevenue: 'Borrow interest plus flash loan fees and liquidation fees',
  SupplySideRevenue: '80% of borrow interest earned by liquidity providers',
};

const fetchCurrentFinanceFees: FetchV2 = async ({
  startTimestamp,
  endTimestamp,
}): Promise<FetchResultV2> => {
  const url = `${dailyFeesApiURL}?fromTimestamp=${startTimestamp}&toTimestamp=${endTimestamp}`;
  const res: DailyFeesApiResponse = await fetchURL(url);
  if (res.code !== 0) {
    throw new Error(`Current Finance API error: ${res.message}`);
  }

  const dailyRevenue = Number(res.data.totalRevenue);
  const dailySupplySideRevenue = Number(res.data.supplySideRevenue);
  const dailyFees = dailyRevenue + dailySupplySideRevenue;

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchCurrentFinanceFees,
      start: "2026-03-25",
    },
  },
  methodology,
};

export default adapter;
