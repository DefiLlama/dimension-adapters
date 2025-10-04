import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

// Volume API - returns last ~60 days of daily volume data
// Last element in array = most recent complete day's volume
// I found this API endpoint in the Quanto website network calls
const VOLUME_API = "https://data.ox.fun/30daysdata";

// Fees API - returns cumulative fees burned over time
// The key value pairs in the returned json object are marked with the date in the key and the cumulative fees burned in the value
// I found this API endpoint in the Quanto website network calls too
const FEES_API =
  "https://api.quanto.trade/v2/accvalue/public/corporate/earn/fee-burned";

interface FeeRecord {
  recordDate: string;
  fee: string;
}

interface FeeResponse {
  success: boolean;
  data: FeeRecord[];
}

// VOLUME CALCULATION
const fetch = async (timestamp: number, _chain: any, options: FetchOptions) => {
  const volumeData = (await httpGet(VOLUME_API)) as number[];
  const feesResponse = (await httpGet(FEES_API)) as FeeResponse;

  // Use the timestamp parameter directly (it's the start of the day being queried)
  const requestedDayTimestamp = timestamp;
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const currentDayTimestamp = Math.floor(currentTimestamp / 86400) * 86400;

  const daysAgo = Math.max(1, Math.floor((currentDayTimestamp - requestedDayTimestamp) / 86400));

  // VOLUME CALCULATION 
  const volumeIndex = volumeData.length - daysAgo;

  if (volumeIndex < 0 || volumeIndex >= volumeData.length) {
    throw new Error(
      `No volume data available for the requested date. Requested date is ${daysAgo} days ago, but only have ${volumeData.length} days of data.`
    );
  }

  const dailyVolume = volumeData[volumeIndex];

  // FEES CALCULATION 
  const requestedDate = new Date(requestedDayTimestamp * 1000)
    .toISOString()
    .split("T")[0];
  const previousDate = new Date((requestedDayTimestamp - 86400) * 1000)
    .toISOString()
    .split("T")[0];

  // Find records for requested date and previous date
  const requestedRecord = feesResponse.data.find(
    (r) => r.recordDate === requestedDate
  );
  const previousRecord = feesResponse.data.find(
    (r) => r.recordDate === previousDate
  );

  let dailyFees = 0;

  if (requestedRecord && previousRecord) {
    const cumulativeFees = parseFloat(requestedRecord.fee);
    const previousCumulativeFees = parseFloat(previousRecord.fee);
    dailyFees = cumulativeFees - previousCumulativeFees;
  } else if (requestedRecord) {
    dailyFees = parseFloat(requestedRecord.fee);
  }

  return {
    dailyVolume: dailyVolume ? dailyVolume.toString() : "0",
    dailyFees: dailyFees.toString(),
    timestamp: requestedDayTimestamp,
  };
};

const methodology = {
  Volume:
    "Perpetuals trading volume tracked from Quanto's perpetuals exchange on Solana. Quanto allows users to trade perpetuals using any token as margin (BTC, ETH, memecoins, NFTs, LP tokens).",
  Fees: "Trading fees collected from users on the Quanto perpetuals exchange.",
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
      start: "2025-07-09",
    },
  },
  methodology,
};

export default adapter;