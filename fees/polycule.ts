import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = await addTokensReceived({
    options,
    targets: ['0xcbc57e7899126f3ad47268a6505231d82b8733c8'],
    tokens: ['0x2791bca1f2de4661ed88a30c99a7a9449aa84174'],
  });
  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.POLYGON],
  start: '2025-06-28',
  methodology: {
    Fees: "fees paid by users on the Polycule platform.",
    Revenue: "fees going to the Polycule protocol.",
    ProtocolRevenue: "fees going to the Polycule protocol.",
  },
}

export default adapter;