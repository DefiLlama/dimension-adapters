import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const floorContract = '0xF6B2C2411a101Db46c8513dDAef10b11184c58fF';
const eventAbi = 'event SaleSettled(address indexed seller, address indexed buyer, uint256 indexed tokenId, uint256 amount)';

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();

    const logs = await options.getLogs({
        eventAbi,
        target: floorContract,
    })

    logs.forEach(l => { dailyFees.addGasToken(l.amount * BigInt(500) / BigInt(10000)) })
    
    return {
        dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue: dailyFees.clone(0.1),
        dailyHoldersRevenue: dailyFees.clone(0.9),
    }

}

const methodology = {
    Fees: 'Counts the total 5% fee charged on winning bids.',
    Revenue: 'All fees are revenue.',
    HoldersRevenue: '4.5% of the winning bid goes to community pool for NFT holders.',
    ProtocolRevenue: '0.5% of the winning bid goes to the protocol.',
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BASE],
    start: '2025-10-09',
    methodology,
}

export default adapter;
