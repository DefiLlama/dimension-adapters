import sdk from "@defillama/sdk";
import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";

const TOKEN = "0xE32f9e8F7f7222fcd83EE0fC68bAf12118448Eaf";

const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD'
const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: DEAD_ADDRESS,
    token: TOKEN
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: '0',
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BSC],
  start: "2025-08-27",
};

export default adapter;
