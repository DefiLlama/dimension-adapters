import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
const feeMaangerContract = "0x90a022796798f9dbA1Da0f8645234B284d4E8EC6";

const fetch: any = async ({ api, fromApi, createBalances, getLogs, }: FetchOptions) => {
    const dailyFees = createBalances()
    const logs = await getLogs({ target: feeMaangerContract, eventAbi: 'event ClaimedFeesWise (address indexed token, uint256 indexed amount, uint256 indexed timestamp)'})
    logs.forEach((log) => dailyFees.add(log.token, log.amount))

    return { dailyFees, }
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-10-01',
        },
    },
};

export default adapter;
