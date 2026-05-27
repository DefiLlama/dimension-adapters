import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const FEE_WALLET = "0x96EE5C63d51e2dB627a5597BfE76da26EF6800D9";
const USDC_E_POLYGON = "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174";
const REWARDS_WALLET = "0xEDC3fDFdC046c05c76872E43636B7E9662F5B5D5";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_WALLET,
    token: USDC_E_POLYGON,
  });

  const dailySupplySideRevenue = await addTokensReceived({
    options,
    fromAddressFilter: FEE_WALLET,
    target: REWARDS_WALLET,
    token: USDC_E_POLYGON,
  });

  const dailyRevenue = dailyFees.clone();
  dailyRevenue.subtract(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "All Kreo fees collected as USDC.e on Polygon and transferred into the Kreo fee wallet.",
  UserFees: "Users pay protocol fees in USDC.e on Polygon that are transferred into the Kreo fee wallet.",
  Revenue: "Part of fees retained by the protocol after rewards are distributed to users",
  ProtocolRevenue: "Part of fees retained by the protocol after rewards are distributed to users",
  SupplySideRevenue: "Rewards distributed to users"
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.POLYGON],
  start: "2026-03-08",
  methodology,
  fetch,
  allowNegativeValue: true, // Rewards are distributed in accumulation
};

export default adapter;
