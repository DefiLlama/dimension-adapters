import { FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const baseUrl = (s: string): string => `https://tools.multiversx.com/growth-api/explorer/analytics/${s}?range=all`;

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const feesUrl = baseUrl('fees-captured');
    const feeResponse = await fetchURL(feesUrl);
    const devRewardsUrl = baseUrl('developer-rewards');
    const devRewardsResponse = await fetchURL(devRewardsUrl);

    const feesDataIndex = feeResponse?.data.findIndex((entry: any) => {
        return (options.fromTimestamp <= entry.timestamp) && (entry.timestamp < options.toTimestamp);
    });

    dailyFees.addGasToken(feeResponse?.data[feesDataIndex].value || 0);
    dailyRevenue.addGasToken((feeResponse?.data[feesDataIndex].value - devRewardsResponse?.data[feesDataIndex].value) || 0);

    return { dailyFees, dailyRevenue };
}


const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.ELROND]: {
            fetch,
            start: "2020-07-31"
        }
    },
    methodology: {
        Fees: "Total fees collected on the MultiversX network.",
        Revenue: "Total fees subtracting the portion earned by developers for smart contract calls.",
    },
    protocolType: ProtocolType.CHAIN,
}

export default adapter;
