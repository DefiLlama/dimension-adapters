import fetchURL from '../../utils/fetchURL';
import { FetchResultFees, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniqStartOfTodayTimestamp } from '../../helpers/getUniSubgraphFees';

const ZO_API_ENDPOINT = 'https://api.zofinance.io';
const TREASURY_FEE_PERCENTAGE = 0.25;

const fetchSui = async (timestamp: number): Promise<FetchResultFees> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const {
    fee: dailyFee,
    tradingFee: dailyTradingFee,
    fundingFee: dailyFundingFee,
    poolFee: dailyPoolFee,
  } = await fetchURL(`${ZO_API_ENDPOINT}/fee?timestamp=${timestamp}`);
  const { totalFee, totalTradingFee, totalFundingFee, totalPoolFee } =
    await fetchURL(`${ZO_API_ENDPOINT}/totalFee`);

  const dailyProtocolRevenue =
    (Number(dailyTradingFee) || 0) * TREASURY_FEE_PERCENTAGE;
  const totalProtocolRevenue =
    (Number(totalTradingFee) || 0) * TREASURY_FEE_PERCENTAGE;
  const dailySupplySideRevenue =
    Number(dailyTradingFee || 0) * (1 - TREASURY_FEE_PERCENTAGE) +
    Number(dailyPoolFee || 0) +
    Number(dailyFundingFee);
  const totalSupplySideRevenue =
    Number(totalTradingFee || 0) * (1 - TREASURY_FEE_PERCENTAGE) +
    Number(totalPoolFee || 0) +
    Number(totalFundingFee);
  return {
    dailyFees: dailyFee ? `${dailyFee}` : undefined,
    totalFees: totalFee ? `${totalFee}` : undefined,
    dailyUserFees: dailyFee ? `${dailyFee}` : undefined,
    totalUserFees: totalFee ? `${totalFee}` : undefined,
    dailySupplySideRevenue: `${dailySupplySideRevenue}`,
    totalSupplySideRevenue: `${totalSupplySideRevenue}`,
    dailyRevenue: dailyProtocolRevenue ? `${dailyProtocolRevenue}` : undefined,
    totalRevenue: totalProtocolRevenue ? `${totalProtocolRevenue}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSui,
      start: '2025-03-24',
    },
  },
};

export default adapter;
