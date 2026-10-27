import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { addTokensReceived } from "../helpers/token";

const GRVT = "0xad29f2723fcdbcf665f210f25e06f97477e417cf";

// Buyback wallet published on https://grvt.io/exchange/buybacks (Safe 2-of-4, Ethereum only).
const BUYBACK_WALLET = "0x494e278d36c69587169424a5556eb7f75fa7d875";

const fetch = async (options: FetchOptions) => {
  const bought = await addTokensReceived({ options, token: GRVT, target: BUYBACK_WALLET });
  return { dailyHoldersRevenue: bought.clone(1, METRIC.TOKEN_BUY_BACK) };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ETHEREUM],
  start: "2026-10-19",
  methodology: {
    HoldersRevenue: "GRVT bought on the open market by the Grvt Foundation's token issuer through an independent execution partner, then permanently burned.",
  },
  breakdownMethodology: {
    HoldersRevenue: {
      [METRIC.TOKEN_BUY_BACK]: "GRVT delivered to the public buyback wallet, valued at the GRVT price on arrival; the wallet later burns it with the token's burn() function.",
    },
  },
};

export default adapter;
