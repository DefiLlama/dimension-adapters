import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const dailyApiUrl = "https://stats.aquabot.io/daily/solana/batch";
const cumulativeApiUrl = "https://stats.aquabot.io/cumulative/solana";

const fetchVolume = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
  const url = `${dailyApiUrl}?from=${startTimestamp}&to=${endTimestamp}`;
  const cumulativeUrl = `${cumulativeApiUrl}?from=${startTimestamp}&to=${endTimestamp}`;
  const response = await fetch(url);
  const cumulativeResponse = await fetch(cumulativeUrl);
  const data = await response.json();
  const cumulativeData = await cumulativeResponse.json();

  const periodFees = data.reduce(
    (sum: number, d: any) => sum + Number(d.generatedFees || 0),
    0
  );
  const cumulativeFees = cumulativeData.fees;

  return {
    dailyFees: periodFees,
    totalFees: cumulativeFees,
    dailyUserFees: periodFees,
    dailyRevenue: periodFees,
    dailyProtocolRevenue: periodFees,
    totalUserFees: cumulativeFees,
    totalRevenue: cumulativeFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchVolume,
      start: 1754870400,
    },
  },
};

export default adapter;