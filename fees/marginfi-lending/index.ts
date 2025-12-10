import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions): Promise<FetchResultV2> => {
    const dailyFees = await getSolanaReceived({ options, target: 'CYXEgwbPHu2f9cY3mcUkinzDoDcsSan7myh1uBvYRbEw' });

    return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
        },
    },
    isExpensiveAdapter: true,
    methodology: {
        Fees: 'Program fees collected by marginfi protocol from lending operations.',
        Revenue: 'Portion of fees collected by marginfi protocol.',
        ProtocolRevenue: 'Fees sent to the marginfi global fee wallet.',
    }
};

export default adapter;
