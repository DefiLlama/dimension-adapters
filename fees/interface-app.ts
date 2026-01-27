import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived, getETHReceived } from "../helpers/token";

const feeWallet = "0xe5b89fa771049df021dcf3817bfc756bb2f85f96"

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances()
    await addTokensReceived({
        options,
        targets: [feeWallet],
        balances: dailyFees,
    });
    await getETHReceived({ options, balances: dailyFees, target: feeWallet })
    console.log(await dailyFees.getUSDJSONs())
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.BASE],
    dependencies: [Dependencies.ALLIUM],
    methodology: {
        Fees: 'All fees paid by users for using Interface App.',
        Revenue: 'Fees collected by Interafce.',
        ProtocolRevenue: 'Fees collected by Interafce.',
    },
};

export default adapter;
