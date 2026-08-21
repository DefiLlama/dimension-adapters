import fetchURL from "../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const statsURL = "https://agents.clawpump.tech/api/platform-stats";

const FEE_RATE = 0.01; // 1% fee on all trading volume
const AGENT_FEE_SHARE = 0.65; // agents earn 65% of trading fees, protocol keeps 35%

const fetch = async ({ createBalances }: FetchOptions): Promise<FetchResult> => {
  const stats = await fetchURL(statsURL);

  const dailyVolume = createBalances();
  const dailyFees = createBalances();
  const dailyRevenue = createBalances();
  const dailySupplySideRevenue = createBalances();

  const volume24h = Number(stats.volume24hUsd);
  const fees = volume24h * FEE_RATE;

  dailyVolume.addUSDValue(volume24h);
  dailyFees.addUSDValue(fees);
  dailyRevenue.addUSDValue(fees * (1 - AGENT_FEE_SHARE));
  dailySupplySideRevenue.addUSDValue(fees * AGENT_FEE_SHARE);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "1% fee charged on all trading volume on ClawPump.",
  UserFees: "Trading fees paid by traders, 1% of trading volume.",
  Revenue: "35% of trading fees kept by the protocol.",
  ProtocolRevenue: "35% of trading fees kept by the protocol.",
  SupplySideRevenue: "65% of trading fees distributed to the AI agents whose tokens generated them.",
};

const adapter: SimpleAdapter = {
  version: 2,
  chains: [CHAIN.SOLANA],
  fetch,
  runAtCurrTime: true,
  methodology,
};

export default adapter;
