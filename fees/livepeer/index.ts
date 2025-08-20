import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import ADDRESSES from '../../helpers/coreAssets.json'

const LIVEPEER_TICKET_BROKER = '0xa8bB618B1520E284046F3dFc448851A1Ff26e41B';
const WINNING_TICKET_REDEEMED_ABI = "event WinningTicketRedeemed(address indexed sender, address indexed recipient, uint256 faceValue, uint256 winProb, uint256 senderNonce, uint256 recipientRand, bytes auxData)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const logs = await options.getLogs({
        target: LIVEPEER_TICKET_BROKER,
        eventAbi: WINNING_TICKET_REDEEMED_ABI,
    });
    logs.forEach((log: any) => {
        dailyFees.add(ADDRESSES.arbitrum.WETH, log[2]);
    });

    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyHoldersRevenue: dailyFees,
    };
}

const methodology = {
    Fees: 'Fees paid by broadcasters for using the Livepeer protocol.',
    Revenue: 'All the fees go to orchestrators and delegators who stake LPT tokens.',
    HoldersRevenue: 'All the fees go to orchestrators and delegators who stake LPT tokens.'
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: '2022-02-11',
    methodology,
};

export default adapter;
