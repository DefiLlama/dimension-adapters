import { FetchOptions, FetchResult, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const baseUrl = (s: string): string => `https://tools.multiversx.com/growth-api/explorer/analytics/${s}?range=all`;

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
    const dailyFees = options.createBalances();

    const feesUrl = baseUrl('fees-captured');
    const feeResponse = await fetchURL(feesUrl);
    const devRewardsUrl = baseUrl('developer-rewards');
    const devRewardsResponse = await fetchURL(devRewardsUrl);

    const feesDataIndex = feeResponse?.data.findIndex((entry: any) => {
        return (options.fromTimestamp <= entry.timestamp) && (entry.timestamp < options.toTimestamp);
    });


    dailyFees.addGasToken((feeResponse?.data[feesDataIndex].value - devRewardsResponse?.data[feesDataIndex].value) || 0, 'Validator Rewards');
    dailyFees.addGasToken(feeResponse?.data[feesDataIndex].value || 0, 'Developer Rewards');

    return { dailyFees, dailyRevenue: 0 };
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
        Revenue: "Total fees that are burned.", // new burn mechanics: https://github.com/multiversx/multiversx-improvement-documents/blob/main/extended/economicsV2.md#c-the-value-accrual-flywheel-fee-market-and-reinvestments
    },
    breakdownMethodology: {
        Fees: {
            'Developer Rewards': 'Fees paid to smart contract creators',
            'Validator Rewards': 'Fees paid to validators for securing the network',
        },
        Revenue: {
            'Revenue': 'Total fees that are burned.',
        },
    },
    protocolType: ProtocolType.CHAIN,
}

export default adapter;
