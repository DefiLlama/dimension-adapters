import { FetchOptions, FetchResultV2 } from "../adapters/types";
import fetchURL from "../utils/fetchURL";

// Origin Protocol publishes a per-product fee breakdown at /daily_revenue and a
// protocol-wide performance-fee figure at /protocol-fees. The performance-fee
// rate is uniform across products, so we apportion the protocol-wide revenue by
// each product's share of total daily fees.
const FEE_API = "https://api.originprotocol.com/api/v2/protocol/daily_revenue";
const REVENUE_API = "https://api.originprotocol.com/api/v2/protocol/protocol-fees";

export const fetchOriginFees = (productKeys: string[]) =>
  async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const [feeData, revenueData] = await Promise.all([
      fetchURL(FEE_API),
      fetchURL(REVENUE_API),
    ]);

    const day = feeData.find((d: any) => d.timestamp === options.startOfDay * 1000);
    const revDay = revenueData.days.find((d: any) => d.date === options.startOfDay);

    if (day) {
      const productFees = productKeys.reduce(
        (sum, key) => sum + Number(day[key]?.amountUSD || 0),
        0,
      );
      const totalFees = Number(day.total?.amountUSD || 0);
      dailyFees.addUSDValue(productFees);

      if (revDay && totalFees > 0) {
        const share = productFees / totalFees;
        dailyRevenue.addUSDValue(Number(revDay.revenue) * share);
      }
    }

    const dailySupplySideRevenue = dailyFees.clone();
    dailySupplySideRevenue.subtract(dailyRevenue);

    return {
      dailyFees,
      dailyRevenue,
      dailyHoldersRevenue: dailyRevenue,
      dailySupplySideRevenue,
    };
  };
