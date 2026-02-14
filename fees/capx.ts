import { CHAIN } from "../helpers/chains";
import { SimpleAdapter } from "../adapters/types";
import { getUniV2LogAdapter } from "../helpers/uniswap";

const methodology = {
  UserFees: "Users pay 1% of each swap",
  Fees: "A 1% trading fee is collected on all swaps",
  Revenue: "90% of the fees (0.9% of volume) goes to protocol treasury",
  ProtocolRevenue: "0.9% of trading volume goes to protocol treasury at 0x87b8F64BE420353d927aBF149EA62B68d45e8CE8",
  SupplySideRevenue: "10% of the fees (0.1% of volume) is distributed to liquidity providers",
}

const breakdownMethodology = {
  UserFees: {
    "Trading fees": "1% fee charged on each token swap transaction",
  },
  Revenue: {
    "Protocol fees": "90% of trading fees allocated to the protocol treasury (0.9% of swap volume)",
  },
  ProtocolRevenue: {
    "Protocol fees": "90% of trading fees deposited into the protocol treasury at 0x87b8F64BE420353d927aBF149EA62B68d45e8CE8",
  },
  SupplySideRevenue: {
    "LP fees": "10% of trading fees distributed to liquidity providers (0.1% of swap volume)",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.CAPX]: {
      fetch: getUniV2LogAdapter({
        factory: '0x5C5A750681708599A77057Fe599c1a7942dcc086',
        fees: 0.01,
        revenueRatio: 0.9,
        protocolRevenueRatio: 0.9,
        allowReadPairs: true,
      }),
      start: 1763329513,
    },
  },
};

export default adapter;