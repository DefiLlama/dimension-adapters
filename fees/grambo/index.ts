import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { parseUnits } from "ethers";

const endpoint = "https://api.grambo.fun/api/stats/defi?";

const fetchFees = async (options: FetchOptions) => {
  const startTime = options.startTimestamp
  const endTime = options.endTimestamp
  const res = await fetchURL(`${endpoint}since=${startTime}&until=${endTime}`)

  const {referralTon, platformTon, creatorTon} = res['fee'];
  const [referralNanoTon, platformNanoTon, creatorNanoTon] = [
    parseUnits(referralTon.toString(), 9),
    parseUnits(platformTon.toString(), 9),
    parseUnits(creatorTon.toString(), 9)
  ]

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(referralNanoTon + platformNanoTon + creatorNanoTon);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addGasToken(referralNanoTon + creatorNanoTon);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addGasToken(platformNanoTon);

  return {
    dailyUserFees: dailyFees,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "User pays fee on each swap. Fees go to the protocol, token creator and optinally to the referral address.",
    UserFees: "User pays fee on each swap. Fees go to the protocol, token creator and optinally to the referral address.",
    Revenue: "Protocol receives 60% of fees paid by users (not including referral fees).",
    SupplySideRevenue: "40% of user fees are distributed among token creator and referral fees.",
  },
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      start: '2026-06-26',
      fetch: fetchFees,
    },
  },
};
export default adapter;
