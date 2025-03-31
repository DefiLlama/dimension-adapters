import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";
import { FetchOptions } from "../../adapters/types";

// const queryId = "4900425"; // removed direct query so changes in query don't affect the data, and better visibility

interface IData {
    quoteAmountOutorIn: number;
    lpFee: number;
    protocolFee: number;
    quoteMint: string;
}

const fetch = async (options: FetchOptions) => {
    const data: IData[] = await queryDune('4881760', {
        start: options.startTimestamp,
        end: options.endTimestamp
    })
    const dailyVolume = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyFees = options.createBalances()

    for (const item of data) {
        dailyVolume.add(item.quoteMint, item.quoteAmountOutorIn)
        dailyProtocolRevenue.add(item.quoteMint, item.protocolFee)
        dailySupplySideRevenue.add(item.quoteMint, item.lpFee)
        dailyFees.addBalances(dailyProtocolRevenue)
        dailyFees.addBalances(dailySupplySideRevenue)
    }

    return { 
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyProtocolRevenue,
        dailyUserFees: dailyFees,
        dailyProtocolRevenue,
        dailySupplySideRevenue
    }
};
  
const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-03-15',
            meta: {
                methodology: {
                    Fees: "Total fees collected from all sources, including both LP fees (0.20%) and protocol fees (0.05%) from each trade",
                    Revenue: "Revenue kept by the protocol, which is the 0.05% protocol fee from each trade",
                    SupplySideRevenue: "Value earned by liquidity providers, which is the 0.20% LP fee from each trade",
                    Volume: "Tracks the trading volume across all pairs on PumpFun AMM",
                }
            }
        }
    },
    version: 2,
    isExpensiveAdapter: true
}

export default adapter
