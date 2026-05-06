import { Adapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTransactions } from "../../helpers/getTxReceipts";

const ABI: any = {
    transferToUser: 'event TransferToUser (address indexed asset,address indexed account, address indexed recipient, uint256 amount)',
    transferToPool: 'event TransferToPool (address indexed asset, address indexed user, uint256 amount)'
};

const M_MARKET = '0x691a5fc3a81a144e36c6C4fBCa1fC82843c80d0d';
const MARGIN_POOL = '0x24a44f1dc25540c62c1196FfC297dFC951C91aB4';

const GAMMA_THEN_MMARKET = "0xd3d2f616"; // function ingresso_GammaThenMMarket(Otoken[] memory otoken, Actions.ActionArgs[] memory actions, MMarketOperations.Operation[] memory operations)
const NEW_USER_POSITION = "0x778ddcb3"; // function ingresso_newUserPosition(bytes calldata payload)

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyNotionalVolume = options.createBalances();
    const dailyPremiumVolume = options.createBalances();

    const depositLogs = await options.getLogs({
        eventAbi: ABI.transferToPool,
        target: MARGIN_POOL
    });

    const premiumReceivedLogs = await options.getLogs({
        eventAbi: ABI.transferToUser,
        target: M_MARKET,
        onlyArgs: false,
    });

    depositLogs.forEach((deposit: any) => {
        const { asset, amount } = deposit;
        dailyNotionalVolume.add(asset, amount);
    });

    const uniqueTxHashes = Array.from(new Set(premiumReceivedLogs.map((log: any) => log.transactionHash.toLowerCase())))
    const txs = await getTransactions(options.chain, uniqueTxHashes, { cacheKey: 'rysk-v12' })
    const txByHash = new Map<string, any>()
    uniqueTxHashes.forEach((hash, idx) => {
        if (txs[idx]) txByHash.set(hash, txs[idx])
    })

    premiumReceivedLogs.forEach((log: any) => {
        const tx = txByHash.get(log.transactionHash.toLowerCase());
        if (!tx) return;
        if (tx.data.startsWith(GAMMA_THEN_MMARKET) || tx.data.startsWith(NEW_USER_POSITION)) {
            const { asset, amount } = log.args;
            dailyPremiumVolume.add(asset, amount);
        }
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