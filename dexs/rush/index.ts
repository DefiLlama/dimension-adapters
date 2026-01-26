import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const dailyApiUrl = "https://stats.rushbot.io/daily/solana";

const fetch = async (_a: any, _b: any, { endTimestamp, startTimestamp }: FetchOptions) => {
  const url = `${dailyApiUrl}?from=${startTimestamp}&to=${endTimestamp}`;

  const data = await fetchURL(url);
  const dailyVolume = data.reduce((sum: number, d: any) => sum + Number(d.volume || 0), 0);
  const dailyFees = data.reduce((sum: number, d: any) => sum + Number(d.generatedFees || 0), 0);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,  
  };
};

const methodology = {
  Fees: "Trading fees collected from all swaps on the platform",
  Revenue: "All trading fees go to the protocol",
  UserFees: "Fees paid by users on each swap",
  ProtocolRevenue: "All trading fees go to the protocol",  
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-11-07",
  methodology,
};

export default adapter;
