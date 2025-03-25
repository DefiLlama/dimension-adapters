import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const queryId = "4900425";

interface IData {
    daily_volume_sol: number;
    daily_protocol_fees_sol: number;
    daily_lp_fees_sol: number;
}

const fetch = async ({ startTimestamp, endTimestamp, createBalances }) => {
  // https://x.com/pumpdotfun/status/1902762316774486276 source for platform and lp fees brakedown
  const data: IData[] = await queryDune(queryId, {
      start: startTimestamp,
      end: endTimestamp,
    })

    const dailyVolume = createBalances()
    const dailySupplySideRevenue = createBalances()
    const dailyProtocolRevenue = createBalances()

    dailyVolume.addGasToken(data[0].daily_volume_sol)
    dailyProtocolRevenue.addGasToken(data[0].daily_protocol_fees_sol)
    dailySupplySideRevenue.addGasToken(data[0].daily_lp_fees_sol)

    const dailyFees = createBalances()
    dailyFees.addBalances(dailyProtocolRevenue)
    dailyFees.addBalances(dailySupplySideRevenue)
    const dailyUserFees = dailyFees.clone(1)

    // console.log(dailyVolume, dailyFees, dailyUserFees, dailyProtocolRevenue, dailySupplySideRevenue)

    return { 
      dailyVolume, 
      dailyFees,
      dailyUserFees,
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
                    Fees: "Each trade has a 0.25% fee - 0.20% goes to LPs and 0.05% goes to the protocol",
                    Volume: "Tracks the trading volume across all pairs on PumpFun AMM",
                }
            }
        }
    },
    version: 2,
    isExpensiveAdapter: true
}

export default adapter
