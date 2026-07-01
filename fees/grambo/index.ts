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
  dailyFees.addGasToken(referralNanoTon, 'Referral Fees');
  dailyFees.addGasToken(platformNanoTon, 'Platform Fees');
  dailyFees.addGasToken(creatorNanoTon, 'Creator Fees');

  const dailyUserFees = dailyFees.clone(1);

  const dailySupplySideRevenue = options.createBalances();
  dailySupplySideRevenue.addGasToken(referralNanoTon, 'Referral Fees To Referrer');
  dailySupplySideRevenue.addGasToken(creatorNanoTon, 'Creator Fees To Creator');

  const dailyRevenue = options.createBalances();
  dailyRevenue.addGasToken(platformNanoTon, 'Platform Fees To Protocol');

  return {
    dailyUserFees,
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue,
  };
};

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "User pays fee on each swap. Fees go to the protocol, token creator and optionally to the referral address.",
    UserFees: "User pays fee on each swap. Fees go to the protocol, token creator and optionally to the referral address.",
    Revenue: "Protocol receives 60% of fees paid by users (not including referral fees).",
    SupplySideRevenue: "40% of user fees are distributed among token creator and referral fees.",
  },
  breakdownMethodology: {
    Fees: {
      'Referral Fees': 'Fee routed to referral address on each swap.',
      'Platform Fees': 'Fee retained by the protocol on each swap.',
      'Creator Fees': 'Fee paid to token creator on each swap.',
    },
    Revenue: { 'Platform Fees To Protocol': '60% of user fees kept by the protocol.' },
    SupplySideRevenue: {
      'Referral Fees To Referrer': 'Referral share of user fees.',
      'Creator Fees To Creator': 'Creator share of user fees.',
    },
  },
  version: 2,
  adapter: {
    [CHAIN.TON]: {
      start: '2026-06-26',
      fetch: fetchFees,
    },
  },
  pullHourly: true,
};
export default adapter;
