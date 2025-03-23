import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const queryId = "4881760";

interface IData {
    amount: number;
    token: string;
}
const fetch = async ({ startTimestamp, endTimestamp, createBalances }) => {
  // https://x.com/pumpdotfun/status/1902762316774486276 source for platform and lp fees brakedown
  const data: IData[] = await queryDune(queryId, {
      start: startTimestamp,
      end: endTimestamp,
    })

    const dailyVolume = createBalances()
    const dailyFees = createBalances()
    const dailyUserFees = createBalances()
    const dailyProtocolRevenue = createBalances()
    const dailySupplySideRevenue = createBalances()

    for (const { amount, token } of data) {
      const totalFees = amount * 0.0025
      dailyVolume.add(token, amount)
      dailyFees.add(token, totalFees)
      dailyUserFees.add(token, totalFees)
      dailyProtocolRevenue.add(token, amount * 0.0005)
      dailySupplySideRevenue.add(token, amount * 0.002)
    }
    
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
            start: '2023-04-01',
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
