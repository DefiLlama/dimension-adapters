import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const SETTLEMENT_ENGINE = "0x7dB5B94c875d12bB77062d368d36D43EAbB6A961"
const FEE_RECIPIENT = "0x17f8dec583Ab9af5De05FBBb4d4C2bfE767A0AC3"
const SETTLED_ABI = "event Settled(address indexed market, uint256 indexed cycleId, address indexed trader, int256 pnl)"

const adapter: Adapter = {
  methodology: {
    Fees: "Trading fees collected from options settlements. Fees are generated from trade fees (7% taker fees, 2% maker rebate, so net 5% to protocol), and liquidation penalties",
    Revenue: "All fees collected go directly to the protocol treasury",
    ProtocolRevenue: "100% of fees are retained by the protocol",
  },
  version: 2,
  adapter: {
    [CHAIN.HYPERLIQUID]: {
      fetch: async (options: FetchOptions) => {
        const logs = await options.getLogs({
          target: SETTLEMENT_ENGINE,
          eventAbi: SETTLED_ABI,
        });

        let totalFees = 0;

        // Filter for events where trader is the FEE_RECIPIENT and sum the pnl values
        for (const log of logs) {
          if (log.trader.toLowerCase() === FEE_RECIPIENT.toLowerCase()) {
            // pnl is int256, can be negative but fees to FEE_RECIPIENT should be positive
            const pnl = Number(log.pnl);
            if (pnl > 0) {
              totalFees += pnl;
            }
          }
        }

        const dailyFees = options.createBalances();
        const dailyRevenue = options.createBalances();
        const dailyProtocolRevenue = options.createBalances();

        dailyFees.addCGToken('tether', totalFees / 1e6);
        dailyRevenue.addCGToken('tether', totalFees / 1e6);
        dailyProtocolRevenue.addCGToken('tether', totalFees / 1e6);

        return {
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue,
        };
      },
      start: '2025-09-25', // Matching V2 transition date from options adapter
    },
  },
}

export default adapter;
