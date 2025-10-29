// https://docs.originprotocol.com/ogn/staking#staking-rewards
import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const revenueApiUrl: string = "https://api.originprotocol.com/api/v2/protocol/protocol-fees";
const feeApiUrl: string = "https://api.originprotocol.com/api/v2/protocol/daily_revenue";

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultV2> => {
  const { startOfDay, createBalances } = options;
  const dailyRevenue = createBalances();
  const dailyFees = createBalances();

  const [feeData, revenueData] = await Promise.all([
    fetchURL(feeApiUrl),
    fetchURL(revenueApiUrl)
  ]);

  const dailyRevenueData = revenueData.days.find((day: any) => day.date === startOfDay);
  const dailyFeeData = feeData.find((day: any) => day.timestamp === startOfDay * 1000);

  if (dailyRevenueData) dailyRevenue.addUSDValue(dailyRevenueData.revenue);
  if (dailyFeeData) dailyFees.addUSDValue(dailyFeeData.total.amountUSD);

  const dailySupplySideRevenue = dailyFees.clone();
  dailySupplySideRevenue.subtract(dailyRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Fees: "All yields generated from origin products",
  Revenue: "Performance fees charged on origin products",
  HoldersRevenue: "All the revenue goes to OGN stakers",
  SupplySideRevenue: "Yields post fees received by origin product holders"
};

const adapter: Adapter = {
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2021-11-02',
    },
  },
  version: 1,
};

export default adapter;
