import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";

const PANCAKESWAP_LOTTERY_CONTRACT = '0x5aF6D33DE2ccEC94efb1bDF8f92Bd58085432d2c';
const TICKETS_PURCHASE_ABI = "event TicketsPurchase (address indexed buyer, uint256 indexed lotteryId, uint256 numberTickets)";

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const lotteryPurchases = await options.getLogs({
        target: PANCAKESWAP_LOTTERY_CONTRACT,
        eventAbi: TICKETS_PURCHASE_ABI,
    });

    lotteryPurchases.forEach((purchase: any) => {
        const ticketsCount = Number(purchase.numberTickets);
        const discount = Math.min(0.1, ((ticketsCount - 1) * (100 / 99000)));
        const volume = ticketsCount * 5 * (1 - discount); //Each ticket worth 5 usd of CAKE
        dailyVolume.addUSDValue(volume);
    });

    const dailyFees = dailyVolume.clone(0.2);

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue: dailyFees,
        dailyHoldersRevenue: dailyFees
    };
}

const methodology = {
    Volume: 'Amount of CAKE spent to purchase lottery tickets',
    Fees: '20% of the lottery amount goes to CAKE buy-back and burn',
    Revenue: '20% of the lottery amount goes to CAKE buy-back and burn',
    HoldersRevenue: '20% of the lottery amount goes to CAKE buy-back and burn'
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.BSC],
    start: '2021-07-02',
    methodology,
};

export default adapter;