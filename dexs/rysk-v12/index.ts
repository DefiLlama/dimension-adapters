import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/* 
Flow :
1. User deposits his assets to the pool, transferToPool event is emitted by marginPool-> We consider this as volume
2. He receives upfront covered call/secured put premium with transferToUser event emitted by mMarket -> We consider this as supply side revenue
3. After maturity, based on the price of the asset he receives either base token or trade token at agreed execution price and transferToUser event is emitted by marginPool with different signature , so doesnt get mixed up with upfront premium(SSR)
*/

const ABI: any = {
    transferToUser: 'event TransferToUser (address indexed asset,address indexed account, address indexed recipient, uint256 amount)',
    transferToPool: 'event TransferToPool (address indexed asset, address indexed user, uint256 amount)'
};

const M_MARKET = '0x691a5fc3a81a144e36c6C4fBCa1fC82843c80d0d';
const MARGIN_POOL = '0x24a44f1dc25540c62c1196FfC297dFC951C91aB4';

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyVolume = options.createBalances();
    const dailyFees = options.createBalances();

    const depositLogs = await options.getLogs({
        eventAbi: ABI.transferToPool,
        target: MARGIN_POOL
    });

    const premiumReceivedLogs = await options.getLogs({
        eventAbi: ABI.transferToUser,
        target: M_MARKET
    });

    depositLogs.forEach((deposit: any) => {
        const { asset, amount } = deposit;
        dailyVolume.add(asset, amount);
    });

    premiumReceivedLogs.forEach((premium: any) => {
        const { asset, amount } = premium;
        dailyFees.add(asset, amount);
    });

    return {
        dailyVolume,
        dailyFees,
        dailyRevenue:0,
        dailySupplySideRevenue: dailyFees
    }
}

const methodology = {
    Volume: "Assets deposited by the users to be executed at pre-agreed price",
    Fees: "Option premium received by users of rysk",
    SupplySideRevenue: "Option premiums received by users"
};

const adapter: Adapter = {
    version: 2,
    fetch,
    methodology,
    chains: [CHAIN.HYPERLIQUID],
    start: '2025-05-30'
}

export default adapter;