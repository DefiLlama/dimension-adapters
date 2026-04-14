import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ABI: any = {
    transferToUser: 'event TransferToUser (address indexed asset,address indexed account, address indexed recipient, uint256 amount)',
    transferToPool: 'event TransferToPool (address indexed asset, address indexed user, uint256 amount)'
};

const M_MARKET = '0x691a5fc3a81a144e36c6C4fBCa1fC82843c80d0d';
const MARGIN_POOL = '0x24a44f1dc25540c62c1196FfC297dFC951C91aB4';

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyNotionalVolume = options.createBalances();
    const dailyPremiumVolume = options.createBalances();

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
        dailyNotionalVolume.add(asset, amount);
    });

    premiumReceivedLogs.forEach((premium: any) => {
        const { asset, amount } = premium;
        dailyPremiumVolume.add(asset, amount);
    });

    return {
        dailyNotionalVolume,
        dailyPremiumVolume,
    }
}


const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: '2025-05-30'
}

export default adapter;