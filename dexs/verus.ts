import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const methodology = {
  Fees: "A 0.025% fee is charged to users on every conversion.",
  UserFees: "Users pay 0.025% fee on every conversion.",
  SupplySideRevenue: "The 50% of swap fee added to reserves of LPs.",
  ProtocolRevenue: "The 50% of swap fee added to the block reward for miners and stakers.",
}

const fetch = async () => {
  const response = await httpGet('https://marketapi.verus.services/getdefichaininfo');

  let dailyVolume = 0;
  for (const result of response.data.results) {
    dailyVolume += Number(result.lp_volume);
  }

  const dailyFees = dailyVolume * 0.00025;
  const dailyRevenue = dailyFees * 0.5;
  const dailyProtocolRevenue = dailyRevenue;
  const dailySupplySideRevenue = dailyFees - dailyRevenue;

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  runAtCurrTime: true,
  methodology,
  adapter: {
    [CHAIN.VERUS]: {},
  },
};

export default adapter;
