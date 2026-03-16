import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { addTokensReceived } from "../helpers/token";

const FEE_WALLET = "0x96EE5C63d51e2dB627a5597BfE76da26EF6800D9";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_WALLET,
    token: ADDRESSES.polygon.USDC,
  });

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Fees: "All Kreo fees are assumed to be collected as USDC.e on Polygon and transferred into the Kreo fee wallet.",
  UserFees: "Users pay protocol fees in USDC.e on Polygon that are transferred into the Kreo fee wallet.",
  Revenue: "Kreo currently treats all fee-wallet inflows as protocol revenue.",
  ProtocolRevenue: "100% of fee-wallet inflows are assumed to be retained by the protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.POLYGON],
  start: "2026-03-13",
  methodology,
  fetch,
};

export default adapter;
