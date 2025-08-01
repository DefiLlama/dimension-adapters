import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const methodology = {
  Fees: "SpookySwap charges a flat 0.2% fee",
  UserFees: "Users pay a 0.2% fee on each trade",
  Revenue: "A 0.03% of each trade goes to treasury",
  HoldersRevenue: "Share of swap fee goes to xBOO stakers.",
  ProtocolRevenue: "Treasury receives a share of the fees",
  SupplySideRevenue: "Liquidity providers get 0.17% of all trades in their pools"
}

const getUniV2LogAdapterConfig = {
  fees: 0.002, // 0.2%
  userFeesRatio: 1,
  revenueRatio: 0.15, // 15% of swap fees, 0.03% from 0.2% swap fees
  protocolRevenueRatio: 0, // no protocol fees
  holdersRevenueRatio: 0.15, // revenue to xBOO -> holders revenue
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getUniV2LogAdapter({ factory: '0x152eE697f2E276fA89E96742e9bB9aB1F2E61bE3', ...getUniV2LogAdapterConfig }),
      start: '2021-04-18',
    },
    [CHAIN.SONIC]: {
      fetch: getUniV2LogAdapter({ factory: '0xEE4bC42157cf65291Ba2FE839AE127e3Cc76f741', ...getUniV2LogAdapterConfig }),
      start: '2024-12-12',
    },
    // [CHAIN.EON]: {
    //   fetch: getUniV2LogAdapter({ factory: '0xa6AD18C2aC47803E193F75c3677b14BF19B94883', ...getUniV2LogAdapterConfig }),
    //   start: '2023-11-03',
    // },
    // [CHAIN.BITTORRENT]: {
    //   fetch: getUniV2LogAdapter({ factory: '0xee4bc42157cf65291ba2fe839ae127e3cc76f741', ...getUniV2LogAdapterConfig }),
    //   start: '2023-06-26',
    // },
  },
};

export default adapter;
