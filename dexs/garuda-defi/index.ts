import { DISABLED_ADAPTER_KEY, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import disabledAdapter from "../../helpers/disabledAdapter";

const { request, gql } = require("graphql-request");

const {
  getUniqStartOfTodayTimestamp,
} = require("../../helpers/getUniSubgraphVolume");

const endpoints = {
  terra: "https://server-grdx-api.diforce.id/graphql", 
};

const historicalData = gql`
  query get_volume($from: Float!, $to: Float!) {
    historicalData(from: $from, to: $to) {
      volumeUST
      timestamp
    }
  }
`;

const volumeQuery = gql`
  query GetDailyVolume($startTime: Float, $endTime: Float) {
    volume(input: { interval: DAILY, startTime: $startTime, endTime: $endTime }) {
      totalVolume
      dailyVolume
      timestamp
      volumeHistory {
        date
        dailyVolume
        totalVolume
      }
      metadata {
        interval
        description
      }
    }
  }
`;

interface IHistoricalDataResponse {
  historicalData: Array<{
    volumeUST: number;
    timestamp: number;
  }>;
}

interface IVolumeResponse {
  volume: {
    totalVolume: string;
    dailyVolume: string;
    timestamp: number;
    volumeHistory: Array<{
      date: number;
      dailyVolume: string;
      totalVolume: string;
    }>;
    metadata: {
      interval: string;
      description: string;
    };
  };
}

const fetch = async (timestamp: number) => {
  try {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    
    console.log(`Fetching volume data for timestamp: ${dayTimestamp}`);
    console.log(`Date: ${new Date(dayTimestamp * 1000).toISOString()}`);

    // Option 1: Using historicalData query 
    const data: IHistoricalDataResponse = await request(endpoints.terra, historicalData, {
      from: dayTimestamp,
      to: dayTimestamp + 86400,
    });

    console.log(`Received ${data.historicalData.length} data points`);

    if (!data.historicalData || data.historicalData.length === 0) {
      console.log(`No data available for ${new Date(dayTimestamp * 1000).toISOString()}`);
      return {
        dailyVolume: undefined,
        timestamp: dayTimestamp,
      };
    }

    const volumeData = data.historicalData[0];
    
    return {
      dailyVolume: volumeData?.volumeUST === 0 || isNaN(volumeData?.volumeUST) 
        ? undefined 
        : volumeData?.volumeUST.toString(),
      timestamp: dayTimestamp,
    };

  } catch (error) {
    console.error(`Error fetching volume data:`, error);
    
    try {
      console.log(`Trying alternative volume query...`);
      
      const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
      const fallbackData: IVolumeResponse = await request(endpoints.terra, volumeQuery, {
        startTime: dayTimestamp,
        endTime: dayTimestamp + 86400,
      });

      const dailyVolume = fallbackData.volume.dailyVolume;
      
      return {
        dailyVolume: dailyVolume === "0" || dailyVolume === "NaN" 
          ? undefined 
          : dailyVolume,
        timestamp: dayTimestamp,
      };

    } catch (fallbackError) {
      console.error(`Fallback query also failed:`, fallbackError);
      
      return {
        dailyVolume: undefined,
        timestamp: getUniqStartOfTodayTimestamp(new Date(timestamp * 1000)),
      };
    }
  }
};

const getStartTimestamp = async () => {
  try {
    console.log(`Getting start timestamp...`);

    const earlyDate = Math.floor(Date.UTC(2021, 0, 1) / 1000); 
    const data: IHistoricalDataResponse = await request(endpoints.terra, historicalData, {
      from: earlyDate,
      to: Math.floor(Date.now() / 1000), 
    });

    if (data.historicalData && data.historicalData.length > 0) {
      const startTimestamp = data.historicalData[0].timestamp;
      console.log(`Start timestamp found: ${startTimestamp} (${new Date(startTimestamp * 1000).toISOString()})`);
      return startTimestamp;
    }

    const fallbackTimestamp = Math.floor(Date.UTC(2022, 0, 1) / 1000); 
    console.log(`Using fallback start timestamp: ${fallbackTimestamp}`);
    return fallbackTimestamp;

  } catch (error) {
    console.error(`Error getting start timestamp:`, error);
    return Math.floor(Date.UTC(2022, 0, 1) / 1000);
  }
};

const adapter: SimpleAdapter = {
  deadFrom: '2023-12-01', 
  adapter: {
    [CHAIN.TERRA]: {
      fetch,
      runAtCurrTime: true,
      start: getStartTimestamp,
    },
    [DISABLED_ADAPTER_KEY]: disabledAdapter
  },
};

export default adapter;
