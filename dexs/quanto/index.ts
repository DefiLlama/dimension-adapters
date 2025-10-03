import {FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";


// Volume API - returns last ~60 days of daily volume data
// Last element in array = most recent complete day's volume
const VOLUME_API = "https://data.ox.fun/30daysdata";

// Fees API - returns cumulative fees burned over time
const FEES_API = "https://api.quanto.trade/v2/accvalue/public/corporate/earn/fee-burned";

interface FeeRecord {
  recordDate: string; // Format: "YYYY-MM-DD"
  fee: string; // Cumulative fees burned
}

interface FeeResponse {
  success: boolean;
  data: FeeRecord[];
}

const fetch = async (options: FetchOptions) => {
    // Fetch the array of daily volumes
    const volumeData = await httpGet(VOLUME_API) as number[];
    
    // Fetch the fees data
    const feesResponse = await httpGet(FEES_API) as FeeResponse;
    
    // Calculate how many days ago the requested date is from today
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const currentDayTimestamp = Math.floor(currentTimestamp / 86400) * 86400; // Start of current day in UTC
    const requestedDayTimestamp = Math.floor(options.startOfDay / 86400) * 86400; // Start of requested day in UTC
    
    const daysAgo = Math.floor((currentDayTimestamp - requestedDayTimestamp) / 86400);
    
    // If requesting today's data (daysAgo = 0), return 0 since the day isn't complete yet
    if (daysAgo <= 0) {
      return {
        dailyVolume: "0",
        dailyFees: "0",
        timestamp: options.startOfDay,
      };
    }
    
    // ===== VOLUME CALCULATION =====
    // The last element (index length-1) represents yesterday (1 day ago)
    const volumeIndex = volumeData.length - daysAgo;
    
    // Validate we have volume data for this date
    if (volumeIndex < 0 || volumeIndex >= volumeData.length) {
      throw new Error(`No volume data available for the requested date. Requested date is ${daysAgo} days ago, but only have ${volumeData.length} days of data.`);
    }
    
    const dailyVolume = volumeData[volumeIndex];
    
    // ===== FEES CALCULATION =====
    // Convert timestamp to YYYY-MM-DD format to match API
    const requestedDate = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
    const previousDate = new Date((options.startOfDay - 86400) * 1000).toISOString().split('T')[0];
    
    // Find records for requested date and previous date
    const requestedRecord = feesResponse.data.find(r => r.recordDate === requestedDate);
    const previousRecord = feesResponse.data.find(r => r.recordDate === previousDate);
    
    let dailyFees = 0;
    
    // Calculate daily fees by subtracting cumulative values
    if (requestedRecord && previousRecord) {
      const cumulativeFees = parseFloat(requestedRecord.fee);
      const previousCumulativeFees = parseFloat(previousRecord.fee);
      dailyFees = cumulativeFees - previousCumulativeFees;
    } else if (requestedRecord) {
      // If no previous record, use the requested record value (for the first day)
      dailyFees = parseFloat(requestedRecord.fee);
    }
    
    return {
      dailyVolume: dailyVolume ? dailyVolume.toString() : "0",
      dailyFees: dailyFees.toString(),
      timestamp: options.startOfDay,
    };
  };
  
  const methodology = {
    Volume: "Perpetuals trading volume tracked from Quanto's perpetuals exchange on Solana. Quanto allows users to trade perpetuals using any token as margin (BTC, ETH, memecoins, NFTs, LP tokens).",
    Fees: "Trading fees collected from users on the Quanto perpetuals exchange.",
  };
  
  const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-07-09',
    methodology,
  };
  
  export default adapter;