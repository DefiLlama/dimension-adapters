import fetchURL from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const ZO_API_ENDPOINT = 'https://api.zofinance.io';
const TREASURY_FEE_PERCENTAGE = 0.25;

const fetch = async (_1: number, _: any, { startOfDay, }: FetchOptions) => {
  const {
    fee: dailyFees,
    tradingFee: dailyTradingFee = 0,
    fundingFee: dailyFundingFee = 0,
    poolFee: dailyPoolFee = 0,
  } = await fetchURL(`${ZO_API_ENDPOINT}/fee?timestamp=${startOfDay}`);

  const dailyProtocolRevenue = dailyTradingFee * TREASURY_FEE_PERCENTAGE
  const dailySupplySideRevenue = dailyTradingFee * (1 - TREASURY_FEE_PERCENTAGE) + +dailyPoolFee + +dailyFundingFee

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch,
      start: '2025-03-24',
    },
  },
};

export default adapter;
