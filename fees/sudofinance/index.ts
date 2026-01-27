import fetchURL from '../../utils/fetchURL';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const sudoApi = 'https://api.zofinance.io';
const TREASURY_FEE_PERCENTAGE = 0.25;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const {
    fee: dailyFee,
    tradingFee: dailyTradingFee,
    fundingFee: dailyFundingFee,
    poolFee: dailyPoolFee,
  } = await fetchURL(`${sudoApi}/fee?timestamp=${options.startOfDay}&protocol=sudo`);

  const dailyProtocolRevenue = (Number(dailyTradingFee) || 0) * TREASURY_FEE_PERCENTAGE;
  const dailySupplySideRevenue = Number(dailyTradingFee || 0) * (1 - TREASURY_FEE_PERCENTAGE) + Number(dailyPoolFee || 0) + Number(dailyFundingFee);

  return {
    dailyFees: dailyFee,
    dailyUserFees: dailyFee,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.SUI],
  fetch,
  start: '2024-01-05',
};

export default adapter;
