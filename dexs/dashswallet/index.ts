import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { SWAP_EXECUTED, chains, start, getContracts } from "../../helpers/dashswallet";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const targets = await getContracts(options);

    const logs = await options.getLogs({
        targets,
        eventAbi: SWAP_EXECUTED,
        flatten: true,
    });

    for (const log of logs) {
        dailyVolume.add(log.srcToken, log.srcAmount);
    }

    return { dailyVolume };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains,
    start,
    methodology: {
        Volume: "Sell-side value of each swap executed through DashsWallet collateral, debt, repay, compound and morpho swap adapters across 7 chains, denominated in the source token.",
    },
};

export default adapter;
