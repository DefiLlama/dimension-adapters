
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const queryId = "4881760";

interface IData {
    amount: number;
    token: string;
}
const fetchVolume = async ({ startTimestamp, endTimestamp, createBalances }) => {
    const data: IData[] = await queryDune(queryId, {
      start: startTimestamp,
      end: endTimestamp,
    })

    const dailyVolume = createBalances()
    for (const { amount, token } of data) {
      dailyVolume.add(token, amount)
    }
    return { dailyVolume }
};
  
const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetchVolume,
            start: '2023-04-01',
        }
    },
    version: 2,
    isExpensiveAdapter: true
}

export default adapter
