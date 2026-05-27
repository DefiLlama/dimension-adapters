// Bounce - Leveraged Tokens on HyperEVM
//
// Volume = notional base asset exposure based on mints and redemptions.
//   notional = baseAmount × targetLeverage
//
//   Mint event:          baseAmount = Base asset amount deposited by user
//   Redeem event:        baseAmount = Base asset amount withdrawn by user (after fees, instant)
//   ExecuteRedeem event: baseAmount = Base asset amount withdrawn by user (after fees, async)
//
// Contract resolution chain:
//   GlobalStorage.factory()         → Factory address
//   GlobalStorage.baseAsset()       → Base asset address
//   Factory.lts()                   → All deployed LeveragedToken addresses
//   LeveragedToken.targetLeverage() → Leverage per token (1e18 scale)

import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const GLOBAL_STORAGE = '0xa07d06383c1863c8A54d427aC890643d76cc03ff';

const MINT_ABI = 'event Mint(address indexed minter, address indexed to, uint256 baseAmount, uint256 ltAmount)';
const REDEEM_ABI = 'event Redeem(address indexed sender, address indexed to, uint256 ltAmount, uint256 baseAmount)';
const EXECUTE_REDEEM_ABI = 'event ExecuteRedeem(address indexed user, uint256 ltAmount, uint256 baseAmount)';

const fetch = async (options: FetchOptions) => {
    const dailyVolume = options.createBalances();

    const factory: string = await options.api.call({ abi: 'address:factory', target: GLOBAL_STORAGE });

    const [baseAsset, lts]: [string, string[]] = await Promise.all([
        options.api.call({ abi: 'address:baseAsset', target: GLOBAL_STORAGE }),
        options.api.call({ abi: 'address[]:lts', target: factory }),
    ]);

    const [leverages, mintLogs, redeemLogs, executeRedeemLogs] = await Promise.all([
        options.api.multiCall({ abi: 'uint256:targetLeverage', calls: lts }),
        options.getLogs({ targets: lts, eventAbi: MINT_ABI, entireLog: true, parseLog: true }),
        options.getLogs({ targets: lts, eventAbi: REDEEM_ABI, entireLog: true, parseLog: true }),
        options.getLogs({ targets: lts, eventAbi: EXECUTE_REDEEM_ABI, entireLog: true, parseLog: true }),
    ]);

    // Mapping LT address to leverage for subsequent log lookup
    const leverageByLt: Record<string, bigint> = {};
    lts.forEach((lt, i) => { leverageByLt[lt.toLowerCase()] = BigInt(leverages[i]); });

    const addNotional = (log: any) => {
        const leverage = leverageByLt[log.address.toLowerCase()];
        const notional = BigInt(log.args.baseAmount) * leverage / 10n ** 18n;
        dailyVolume.add(baseAsset, notional);
    };

    mintLogs.forEach((log: any) => addNotional(log,));
    redeemLogs.forEach((log: any) => addNotional(log,));
    executeRedeemLogs.forEach((log: any) => addNotional(log));

    return { dailyVolume };
};

const methodology = {
    Volume: 'Notional leveraged exposure created and destroyed via mints and redemptions. Calculated as base asset amount × target leverage per token.',
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    start: '2026-01-28',
    methodology,
};

export default adapter;
