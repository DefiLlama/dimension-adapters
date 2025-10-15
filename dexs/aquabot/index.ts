import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const dailyApiUrl = "https://stats.aquabot.io/daily/solana/batch";

const fetch = async (
  _a: any,
  _b: any,
  { endTimestamp, startTimestamp }: FetchOptions
) => {
  const url = `${dailyApiUrl}?from=${startTimestamp}&to=${endTimestamp}`;

  const data = await fetchURL(url);
  const dailyVolume = data.reduce(
    (sum: number, d: any) => sum + Number(d.volume || 0),
    0
  );
  const dailyFees = data.reduce(
    (sum: number, d: any) => sum + Number(d.generatedFees || 0),
    0
  );

  const REVENUE_CONSTANT = 0.75;
  const dailyHoldersRevenue = dailyFees * REVENUE_CONSTANT

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees - dailyHoldersRevenue,
    dailyHoldersRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "Users pay trade fees on each swap. Every user has a fee receiver and they are used to do regular payments on campaigns and referral programs.",
  Revenue: "All swap fees goes to the protocol",
  UserFees:
    "Users pay trade fees on each swap. Every user has a fee receiver and they are used to do regular payments on campaigns and referral programs.",
  ProtocolRevenue: "All swap fees goes to the protocol",
  HoldersRevenue: "No Holders Revenue",
};

const adapter: SimpleAdapter = {
  fetch,
  deadFrom: '2025-09-13', // likely rugged after the presale
  chains: [CHAIN.SOLANA],
  start: "2025-08-11",
  methodology,
};

export default adapter;
