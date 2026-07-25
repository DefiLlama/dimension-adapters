import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const WINDFALL_LOTTO =
  "0x9650D206c6e0093FBc1D623b2A1e03984D24d3f1";

const WINDFALL_FEE_SHARE =
  "0x8d1e76657F469932Dd04d0Bad2f0FCE0bbDb22a5";

const POLYGON_DAI =
  "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    target: WINDFALL_FEE_SHARE,
    token: POLYGON_DAI,
    fromAdddesses: [WINDFALL_LOTTO],
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,

  fetch,
  chains: [CHAIN.POLYGON],

  start: "2026-04-05",

  methodology: {
    Fees:
      "The 10% DAI fee charged on Windfall Lotto ticket purchases and transferred from the main lottery contract to WindfallFeeShare.",

    Revenue:
      "All ticket-purchase fees transferred to the WindfallFeeShare distribution contract.",

    HoldersRevenue:
      "All collected ticket fees are allocated through WindfallFeeShare to registered Windfall Lotto shareholders.",
  },
};

export default adapter;
