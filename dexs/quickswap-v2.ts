import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { uniV2Exports } from "../helpers/uniswap";

// 0.3% swap fee: 0.25% to LPs, 0.04% to community buybacks, 0.01% to foundation
const feeConfig = {
  userFeesRatio: 1,
  revenueRatio: 0.05 / 0.3,
  protocolRevenueRatio: 0.01 / 0.3,
  holdersRevenueRatio: 0.04 / 0.3,
};

const adapter: SimpleAdapter = uniV2Exports({
  [CHAIN.POLYGON]: {
    factory: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',
    start: '2020-10-09',
    ...feeConfig,
  },
  [CHAIN.BASE]: {
    factory: '0xEC6540261aaaE13F236A032d454dc9287E52e56A',
    start: '2025-06-04',
    ...feeConfig,
  },
  // [CHAIN.DOGECHAIN]: {
  //   factory: '0xC3550497E591Ac6ed7a7E03ffC711CfB7412E57F',
  //   start: '2023-04-11',
  //   ...feeConfig,
  // }
}, { runAsV1: true });

adapter.methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  Fees: "0.3% of each swap is collected as trading fees",
  Revenue: "Protocol takes 16.66% of collected fees (0.04% community + 0.01% foundation).",
  ProtocolRevenue: "Foundation receives 3.33% of collected fees (0.01% of swap volume).",
  SupplySideRevenue: "83.33% of collected fees go to liquidity providers (0.25% of swap volume).",
  HoldersRevenue: "Community receives 13.33% of collected fees for buybacks (0.04% of swap volume).",
};

export default adapter;
