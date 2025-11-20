import { gql, request } from "graphql-request";
import { SimpleAdapter, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";

const endpoint = "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-trade/latest/gn";

interface IVolumeStat {
  cumulativeVolumeUsd: string;
  volumeUsd: string;
  id: string;
}

interface IFeeStat {
  cumulativeFeeUsd: string;
  feeUsd: string;
  id: string;
}

interface ITradingStat {
  fundingFeeUsd: string;
  id: string;
}

const fetch = async (timestamp: number): Promise<FetchResultV2> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp);

  const period = "daily";
  const graphQuery = gql`
    query MyQuery {
      volumeStats(where: {timestamp: ${todaysTimestamp}, period: "daily"}) {
        cumulativeVolumeUsd
        id
        volumeUsd
      }
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
    }
  `;

  const response = await request(endpoint, graphQuery);
  const volumeStats: IVolumeStat[] = response.volumeStats;
  const feeStats: IFeeStat[] = response.feeStats;
  const tradingStats: ITradingStat[] = response.tradingStats;

  let dailyVolumeUSD = BigInt(0);
  let dailyFeeUSD = BigInt(0);
  let dailyFundingFeeUSD = BigInt(0);

  volumeStats.forEach((vol) => {
    dailyVolumeUSD += BigInt(vol.volumeUsd);
  });
  
  // Sum up trading fees from feeStats
  feeStats.forEach((fee) => {
    dailyFeeUSD += BigInt(fee.feeUsd);
  });

  // Sum up funding fees from tradingStats
  tradingStats.forEach((stat) => {
    dailyFundingFeeUSD += BigInt(stat.fundingFeeUsd);
  });

  const dailyVolume = parseInt(dailyVolumeUSD.toString()) / 1e18;
  const dailyFees = (Number(dailyFeeUSD) + Number(dailyFundingFeeUSD)) / 1e18
  const dailyUserFees = Number(dailyFeeUSD) / 1e18

  // Revenue calculations
  // Revenue = total fees
  const dailyRevenue = dailyFees;
  
  // Protocol revenue = 60% of revenue
  const dailyProtocolRevenue = dailyRevenue * 0.6;
  
  // Supply side revenue = 40% of revenue
  const dailySupplySideRevenue = dailyRevenue * 0.4;

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Total daily trading volume from all perpetual markets on SparkDEX.",
  Fees: 'Fees collected from user trading fees and funding fees on SparkDEX perpetual markets.',
  UserFees: 'Fees collected from user trading fees on SparkDEX perpetual markets.',
  Revenue: "Total revenue equals total fees collected",
  ProtocolRevenue: "60% of total revenue goes to the protocol",
  SupplySideRevenue: "40% of total revenue goes to liquidity providers",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: '2024-11-05',
    },
  },
  methodology,
};

export default adapter;
