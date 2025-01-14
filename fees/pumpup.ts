import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {queryEvents} from "../helpers/sui"

const fetchFees = async (options: FetchOptions) => {
        const dailyFees = options.createBalances()
        const events = await queryEvents({eventType:"0x3f2a0baf78f98087a04431f848008bad050cb5f4427059fa08eeefaa94d56cca::curve::Points", options})
        events.map(ev=>dailyFees.addCGToken("sui", ev.amount/1e9))

        return { dailyFees, dailyRevenue: dailyFees }
    }

const adapters: SimpleAdapter = {
    adapter: {
        [CHAIN.SUI]: {
            fetch: fetchFees,
            start: '2024-06-02'
        },
    },
    version: 2
}
export default adapters;
