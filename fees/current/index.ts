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
    totalRevenue: number;
    fee: string;
  };
}

const methodology = {
  Fees: 'Flash loan and liquidation fees paid by borrowers and liquidated positions',
  Revenue: 'Borrow interest paid by borrowers plus flash loan and liquidation fees',
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

  const dailyFees = Number(res.data.fee);
  const totalRevenue = Number(res.data.totalRevenue);

  return {
    dailyFees,
    dailyRevenue: totalRevenue,
    dailyProtocolRevenue: totalRevenue,
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
