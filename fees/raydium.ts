import { BaseAdapter, Adapter } from "../adapters/types";
import volumeAdapter from "../dexs/raydium";
import { getDexChainFees } from "../helpers/getRaydiumFees";

const TOTAL_FEES = 0.0025;
const PROTOCOL_FEES = 0;

const feeAdapter: BaseAdapter = getDexChainFees({
  totalFees: TOTAL_FEES,
  protocolFees: PROTOCOL_FEES,
  supplySideRevenue: 0.0022,
  holdersRevenue: 0.0003,
  revenue: 0.0003,
  userFees: TOTAL_FEES,
  volumeAdapter,
  meta: {
    methodology: {
      // UserFees: "User pays 0.25% fees on each swap",
      // Fees: "A 0.25% of each swap is collected as trading fees",
      // SupplySideRevenue: "A 0.22% of the trades goes back to the LP pool as fees earned",
      // HoldersRevenue: "A 0.03% of the trade goes to buying RAY and distributing it to stakers",
      // ProtocolRevenue: "Raydium's AMM earns from the spread it places on the order book and all earnings from market making go back to Raydium liquidity providers",
      // Revenue: "A 0.03% of the trade goes to buying RAY and distributing it to stakers",

      UserFees: "User paid fees for swaps",
      Fees: "Fees collected from swaps",
      SupplySideRevenue: "Total fees to liquidity providers",
      HoldersRevenue: "RAY Buybacks",
      ProtocolRevenue: "Revenue earned from buybacks and DAO treasury",
      Revenue: "A portion of all trading fees goes to buying back RAY",
    }
  }
});

const adapter: Adapter = {
  version: 2,
  adapter: feeAdapter
};

export default adapter;
