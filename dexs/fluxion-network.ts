import { CHAIN } from "../helpers/chains";
import { uniV3Exports } from "../helpers/uniswap";

// const v3Endpoints = {
//   [CHAIN.MANTLE]: "https://subgraph-api.mantle.xyz/api/public/346c94bd-5254-48f7-b71c-c7fa427ae0a8/subgraphs/uni-v3/v0.0.1/gn",
// };

const adapter = uniV3Exports({
  [CHAIN.MANTLE]: {
    factory: "0xF883162Ed9c7E8EF604214c964c678E40c9B737C",
    start: '2025-11-17',
    userFeesRatio: 1,
    revenueRatio: 0, // all fees tot LPs
  },
});

adapter.methodology = {
  Fees: 'Users pay fees on every swap.',
  UserFees: 'Users pay fees on every swap.',
  Revenue: 'No revenue.',
  SupplySideRevenue: 'All swap fees are distributed to LPs.',
}

export default adapter;
