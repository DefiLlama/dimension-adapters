import { gql, request } from "graphql-request";
import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoint = "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-trade/latest/gn";

interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

interface ITradingStat {
  fundingFeeUsd: string;
  id: string;
}

const fetch = async (timestamp: number) => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);
  const period = "daily";

  const graphQuery = gql`{
    feeStats(where: {timestamp: ${todaysTimestamp}, period: "${period}"}) {
      id
      timestamp
      period
      cumulativeFeeUsd
      feeUsd
    }
    tradingStats(where: {timestamp: ${todaysTimestamp}, period: "${period}"}) {
      id
      fundingFeeUsd
    }
  }`;

  const response = await request(endpoint, graphQuery);
  const feeStats: IFeeStat[] = response.feeStats;
  const tradingStats: ITradingStat[] = response.tradingStats;

  let dailyFeeUSD = BigInt(0);
  let dailyFundingFeeUSD = BigInt(0);

  // Sum up trading fees from feeStats
  feeStats.forEach((fee) => {
    dailyFeeUSD += BigInt(fee.feeUsd);
  });

  // Sum up funding fees from tradingStats
  tradingStats.forEach((stat) => {
    dailyFundingFeeUSD += BigInt(stat.fundingFeeUsd);
  });

  // Total fees = trading fees + funding fees
  const totalFeeUSD = dailyFeeUSD + dailyFundingFeeUSD;
  const finalDailyFee = parseInt(totalFeeUSD.toString()) / 1e18;

  return {
    timestamp: todaysTimestamp,
    dailyFees: finalDailyFee,
  };
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
    },
  },
  start: '2024-11-05',
  methodology: "Fees collected from user trading fees and funding fees on SparkDEX perpetual markets",
};

export default adapter;

