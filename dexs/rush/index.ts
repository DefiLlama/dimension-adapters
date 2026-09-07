import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const dailyApiUrl = "https://stats.rushbot.io/daily/solana";

const fetch = async ({ endTimestamp, startTimestamp }: FetchOptions) => {
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
  // stats.rushbot.io is NXDOMAIN and so is the rushbot.io apex. The adapter only ever produced
  // 24 points, the last on 2025-12-01 ($11), and the protocol no longer reports TVL.
  deadFrom: '2025-12-02',
};

export default adapter;
