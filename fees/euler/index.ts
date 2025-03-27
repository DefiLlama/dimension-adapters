import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";

const eVaultFactories = {
    [CHAIN.ETHEREUM]: "0x29a56a1b8214D9Cf7c5561811750D5cBDb45CC8e",
    [CHAIN.SONIC]: "0xF075cC8660B51D0b8a4474e3f47eDAC5fA034cFB",
    [CHAIN.BASE]: "0x7F321498A801A191a93C840750ed637149dDf8D0"
}

const eulerFactoryABI = {
    vaultLength: "function getProxyListLength() view returns (uint256)",
    getProxyListSlice: "function getProxyListSlice(uint256 start, uint256 end) view returns (address[] list)",
}

const eulerVaultABI = {
    asset: "function asset() view returns (address)",
    interestAccumulator: "function interestAccumulator() view returns (uint256)",
    accumulatedFees: "function accumulatedFees() view returns (uint256)",
    totalBorrows: "function totalBorrows() view returns (uint256)",
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
    convertFees: "event ConvertFees(address indexed account, address indexed protocolReceiver, address indexed governorReceiver, uint256 protocolShares, uint256 governorShares)",
    vaultStatus: "event VaultStatus(uint256 totalShares, uint256 totalBorrows, uint256 accumulatedFees, uint256 cash, uint256 interestAccumulator, uint256 interestRate, uint256 timestamp)"
}

const getVaults = async ({createBalances, api, fromApi, toApi, getLogs, chain}: FetchOptions, {
    dailyFees,
    dailyRevenue,
}: {
    dailyFees?: sdk.Balances,
    dailyRevenue?: sdk.Balances,
}) => {

    if (!dailyFees) dailyFees = createBalances()
    if (!dailyRevenue) dailyRevenue = createBalances()
    const vaultLength = await fromApi.call({target: eVaultFactories[chain], abi: eulerFactoryABI.vaultLength})
    const vaults = await fromApi.call({target: eVaultFactories[chain], abi: eulerFactoryABI.getProxyListSlice, params: [0, vaultLength]})
    const underlyings = await fromApi.multiCall({calls: vaults, abi: eulerVaultABI.asset})
    underlyings.forEach((underlying, index) => {
        if (!underlying) underlyings[index] = '0x0000000000000000000000000000000000000000'
    })    

    const accumulatedFeesStart = await fromApi.multiCall({calls: vaults, abi: eulerVaultABI.accumulatedFees})
    const accumulatedFeesEnd = await toApi.multiCall({calls: vaults, abi: eulerVaultABI.accumulatedFees})
    const interestAccumulatorStart = await fromApi.multiCall({calls: vaults, abi: eulerVaultABI.interestAccumulator})
    const interestAccumulatorEnd = await toApi.multiCall({calls: vaults, abi: eulerVaultABI.interestAccumulator})
    const totalBorrows = await toApi.multiCall({calls: vaults, abi: eulerVaultABI.totalBorrows})
    const dailyInterest = totalBorrows.map((borrow, i) => borrow * (interestAccumulatorEnd[i] - interestAccumulatorStart[i]) / interestAccumulatorStart[i])

    const logs = (await getLogs({targets: vaults, eventAbi: eulerVaultABI.convertFees, flatten: false})).map((vaultLogs) => {
        if (!vaultLogs.length) return 0n;
        let totalShares = 0n;
        totalShares += (vaultLogs.protocolShares + vaultLogs.governorShares);
        return totalShares;
    });

    //calculate (accumulatedFeesEnd - accumulatedFeesStart) + totalShares from convertFees
    const accumulatedFees = accumulatedFeesEnd.map((fees, i) => {
        const feesEnd = BigInt(fees.toString());
        const feesStart = BigInt(accumulatedFeesStart[i].toString());
        return feesEnd - feesStart + logs[i];
    });

    //we then convert the accumulatedFees to asset by calling convertToAssets at the end therefore we won't have any problem with conversion rate changing
    const totalAssets = await toApi.multiCall({
        calls: accumulatedFees.map((fees, i) => ({
            target: vaults[i],
            params: [fees.toString()]
        })),
        abi: eulerVaultABI.convertToAssets,
    });

    totalAssets.forEach((assets, i) => {
        dailyFees.add(underlyings[i], dailyInterest[i])
        dailyRevenue.add(underlyings[i], assets)
    })
    const dailySupplySideRevenue = dailyFees.clone()
    dailySupplySideRevenue.subtract(dailyRevenue)

    return {dailyFees,dailyRevenue, dailySupplySideRevenue}
}

const fetch = async (options: FetchOptions) => {
    return await getVaults(options, {})
}

const methodology = {
    dailyFees: "Interest that are paid by the borrowers to the vaults",
    dailyRevenue: "Protocol & Governor fees share"
}

const adapters: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: '2024-08-18',
            meta: {
                methodology
            }
        },
        [CHAIN.SONIC]: {
            fetch: fetch,
            start: '2025-01-31',
            meta: {
                methodology
            }
        },
        // [CHAIN.BASE]: {
        //     fetch: fetch,
        //     start: '2024-11-27',
        //     meta: {
        //         methodology
        //     }
        // }
    },
    
    version: 2
}

export default adapters;