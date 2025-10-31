import fetchURL from '../../utils/fetchURL';
import { FetchResultFees, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphFees';

const sudoApi = 'https://api.sudofinance.xyz';
const TREASURY_FEE_PERCENTAGE = 0.25;

const fetchSui = async (timestamp: number): Promise<FetchResultFees> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const {
    fee: dailyFee,
    tradingFee: dailyTradingFee,
    fundingFee: dailyFundingFee,
    poolFee: dailyPoolFee,
  } = await fetchURL(`${sudoApi}/fee?timestamp=${timestamp}`);

  const dailyProtocolRevenue =
    (Number(dailyTradingFee) || 0) * TREASURY_FEE_PERCENTAGE;
  const dailySupplySideRevenue =
    Number(dailyTradingFee || 0) * (1 - TREASURY_FEE_PERCENTAGE) +
    Number(dailyPoolFee || 0) +
    Number(dailyFundingFee);
  return {
    dailyFees: dailyFee,
    dailyUserFees: dailyFee,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSui,
      start: '2024-01-05',
    },
  },
};

export default adapter;
