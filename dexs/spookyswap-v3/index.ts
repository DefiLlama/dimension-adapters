import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const methodology = {
  Fees: "Each pool charge between 0.01% to 1% fee",
  UserFees: "Users pay between 0.01% to 1% fee",
  Revenue: "0 to 15% of the fee goes to treasury",
  HoldersRevenue: "Share of swap fee goes to xBOO stakers.",
  ProtocolRevenue: "Treasury receives a share of the fees",
  SupplySideRevenue: "Liquidity providers get most of the fees of all trades in their pools"
}

const getUniV3LogAdapterConfig = {
  userFeesRatio: 1,
  revenueRatio: 0,
  protocolRevenueRatio: 0,
  holdersRevenueRatio: 0,
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.FANTOM]: {
      fetch: getUniV3LogAdapter({ factory: '0x7928a2c48754501f3a8064765ECaE541daE5c3E6', ...getUniV3LogAdapterConfig }),
      start: '2023-11-22',
    },
    [CHAIN.SONIC]: {
      fetch: getUniV3LogAdapter({ factory: '0x3D91B700252e0E3eE7805d12e048a988Ab69C8ad', ...getUniV3LogAdapterConfig }),
      start: '2024-12-12',
    },
    // [CHAIN.BITTORRENT]: {
    //   fetch: getUniV3LogAdapter({ factory: '0xE12b00681dD2e90f51d9Edf55CE1A7D171338165', ...getUniV3LogAdapterConfig }),
    //   start: '2023-11-22',
    // },
  },
};

export default adapter;
