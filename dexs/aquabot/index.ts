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

  const periodVolume = data.reduce(
    (sum: number, d: any) => sum + Number(d.volume || 0),
    0
  );
  const cumulativeVolume = cumulativeData.volume;

  return {
    dailyVolume: periodVolume,
    totalVolume: cumulativeVolume,
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

adapter.methodology = {
  UserFees:
    "Users pay trade fees on each swap. Every user has a fee receiver and they are used to do regular payments on campaigns and referral programs.",
  ProtocolRevenue: "Protocol receives a percentage of trade fees.",
};

export default adapter;