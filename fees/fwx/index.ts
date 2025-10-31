import { Chain } from "../../adapters/types";
import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpPost } from "../../utils/fetchURL";

interface IDailyFeeData {
  daily_interest_paid: string;
  daily_trading_fee: string;
  daily_otf_fee: string;
  daily_bounty_fee_to_protocol: string;
  daily_bounty_fee_to_liquidator: string;
  daily_liquidation_fee: string;
}

const endpoints = {
  dailyFees: "https://analytics.fwx.finance/api/fees",
};

const CHAIN_ID = {
  [CHAIN.AVAX]: 43114,
  [CHAIN.BASE]: 8453,
  [CHAIN.BSC]: 56,
};

const fetch = (chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(timestamp * 1e3)
    );
    const date = new Date(dayTimestamp * 1e3);
    const formattedDate = date.toISOString().replace(/\.(\d{3})Z$/, ".$1Z");

    // * call api for daily fees and revenue
    const marginTradeRes = await httpPost(endpoints.dailyFees, {
      date: formattedDate,
      chain_id: CHAIN_ID[chain],
      is_perp: false,
    });

    const marginTradeResData = marginTradeRes as IDailyFeeData;

    const perpRes = await httpPost(endpoints.dailyFees, {
      date: formattedDate,
      chain_id: CHAIN_ID[chain],
      is_perp: true,
    });
    const perpResData = perpRes as IDailyFeeData;

    const dailyInterestPaid =
      parseFloat(marginTradeResData.daily_interest_paid) +
      parseFloat(perpResData.daily_interest_paid);
    const dailyTradingFee =
      parseFloat(marginTradeResData.daily_trading_fee) +
      parseFloat(perpResData.daily_trading_fee);
    const dailyOtfFee =
      parseFloat(marginTradeResData.daily_otf_fee) +
      parseFloat(perpResData.daily_otf_fee);
    const dailyBountyFeeToProtocol =
      parseFloat(marginTradeResData.daily_bounty_fee_to_protocol) +
      parseFloat(perpResData.daily_bounty_fee_to_protocol);
    const dailyBountyFeeToLiquidator =
      parseFloat(marginTradeResData.daily_bounty_fee_to_liquidator) +
      parseFloat(perpResData.daily_bounty_fee_to_liquidator);
    const dailyLiquidationFee =
      parseFloat(marginTradeResData.daily_liquidation_fee) +
      parseFloat(perpResData.daily_liquidation_fee);

    // daily
    const dailyFees =
      dailyInterestPaid +
      dailyTradingFee +
      dailyLiquidationFee +
      dailyBountyFeeToLiquidator +
      dailyBountyFeeToProtocol +
      dailyOtfFee;

    const dailySupplySideRevenue =
      0.9 * parseFloat(marginTradeResData.daily_interest_paid) +
      0.2 * parseFloat(marginTradeResData.daily_trading_fee) +
      0.8 * parseFloat(perpResData.daily_trading_fee) +
      parseFloat(perpResData.daily_otf_fee);

    const dailyProtocolRevenue =
      0.1 * parseFloat(marginTradeResData.daily_interest_paid) +
      0.8 * parseFloat(marginTradeResData.daily_trading_fee) +
      0.2 * parseFloat(perpResData.daily_trading_fee) +
      parseFloat(marginTradeResData.daily_bounty_fee_to_protocol) +
      parseFloat(perpResData.daily_bounty_fee_to_protocol);


    return {
      timestamp,
      dailyFees,
      dailyRevenue: dailyProtocolRevenue + dailySupplySideRevenue,
      dailyProtocolRevenue: dailyProtocolRevenue,
      dailySupplySideRevenue: dailySupplySideRevenue,
    };
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: fetch(CHAIN.AVAX),
      start: "2023-11-01",
    },
    [CHAIN.BASE]: {
      fetch: fetch(CHAIN.BASE),
      start: "2024-09-04",
    },
    [CHAIN.BSC]: {
      fetch: fetch(CHAIN.BSC),
      start: "2024-01-22",
    },
  },
  version: 1,
};
export default adapter;
