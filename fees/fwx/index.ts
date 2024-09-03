import { Chain } from "@defillama/sdk/build/general";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

interface IEndpoint {
  dailyFees: string;
  chainId: number;
}

interface IDailyFeeData {
  daily_interest_paid: string;
  daily_trading_fee: string;
  daily_bounty_fee_to_protocol: string;
  daily_bounty_fee_to_liquidator: string;
  daily_liquidation_fee: string;
  total_interest_paid: string;
  total_trading_fee: string;
  total_bounty_fee_to_protocol: string;
  total_bounty_fee_to_liquidator: string;
  total_liquidation_fee: string;
}

const endpoints: Record<Chain, IEndpoint> = {
  [CHAIN.AVAX]: {
    dailyFees: "https://analytics.fwx.finance/api/fees",
    chainId: 43114,
  },
};

const CHAIN_ID = {
  [CHAIN.AVAX]: 43114,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1e3)
    );
    const date = new Date(dayTimestamp * 1e3);
    const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

    // * call api for daily fees and revenue
    const dailyRes = await httpPost(endpoints[chain].dailyFees, {
      date: formattedDate,
      chain_id: CHAIN_ID[chain],
    });
    const dailyData = dailyRes as IDailyFeeData;
    const dailyInterestPaid = parseFloat(dailyData.daily_interest_paid);
    const dailyTradingFee = parseFloat(dailyData.daily_trading_fee);
    const dailyBountyFeeToProtocol = parseFloat(
      dailyData.daily_bounty_fee_to_protocol
    );
    const dailyBountyFeeToLiquidator = parseFloat(
      dailyData.daily_bounty_fee_to_liquidator
    );
    const dailyLiquidationFee = parseFloat(dailyData.daily_liquidation_fee);
    const totalInterestPaid = parseFloat(dailyData.total_interest_paid);
    const totalTradingFee = parseFloat(dailyData.total_trading_fee);
    const totalBountyFeeToProtocol = parseFloat(
      dailyData.total_bounty_fee_to_protocol
    );
    const totalBountyFeeToLiquidator = parseFloat(
      dailyData.total_bounty_fee_to_liquidator
    );
    const totalLiquidationFee = parseFloat(dailyData.total_liquidation_fee);

    const dailyFees =
      dailyInterestPaid +
      dailyTradingFee +
      dailyLiquidationFee +
      dailyBountyFeeToLiquidator +
      dailyBountyFeeToProtocol;
    const dailySupplySideRevenue =
      0.1 * dailyInterestPaid +
      0.8 * dailyTradingFee +
      dailyBountyFeeToProtocol;
    const dailyProtocolRevenue =
      0.9 * dailyInterestPaid + 0.2 * dailyTradingFee;
    const totalFees =
      totalInterestPaid +
      totalTradingFee +
      totalLiquidationFee +
      totalBountyFeeToLiquidator +
      totalBountyFeeToProtocol;
    const totalSupplySideRevenue =
      0.1 * totalInterestPaid +
      0.8 * totalTradingFee +
      totalBountyFeeToProtocol;
    const totalProtocolRevenue =
      0.9 * totalInterestPaid + 0.2 * totalTradingFee;

    return {
      timestamp,
      dailyFees: dailyFees,
      dailyRevenue: dailyProtocolRevenue + dailySupplySideRevenue,
      dailyProtocolRevenue: dailyProtocolRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
      totalFees: totalFees,
      totalRevenue: totalProtocolRevenue + totalSupplySideRevenue,
      totalProtocolRevenue: totalProtocolRevenue,
      totalSupplySideRevenue: totalSupplySideRevenue,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: 1701907200,
    },
  },
  version: 1,
};
export default adapter;
