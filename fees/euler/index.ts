import { Adapter, FetchOptions, SimpleAdapter } from "../../adapters/types"
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
    accumulatedFeesAssets: "function accumulatedFeesAssets() view returns (uint256)",
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
    const vaultLength = await api.call({target: eVaultFactories[chain], abi: eulerFactoryABI.vaultLength})
    const vaults = await api.call({target: eVaultFactories[chain], abi: eulerFactoryABI.getProxyListSlice, params: [0, vaultLength]})
    const underlyings = await api.multiCall({calls: vaults.map(vault=>({target: vault})), abi: eulerVaultABI.asset})
    underlyings.forEach((underlying, index) => {
        if (!underlying) underlyings[index] = '0x0000000000000000000000000000000000000000'
    })    
    
    const vaultWithUnderlyings = vaults.map((vault, index) => ({vault, underlying: underlyings[index]}))
    await Promise.all(vaultWithUnderlyings.map(async ({ vault, underlying }) => {
        const accumulatedFeesStart = await fromApi.call({target: vault, abi: eulerVaultABI.accumulatedFeesAssets, permitFailure: true})
        const accumulatedFeesEnd = await toApi.call({target: vault, abi: eulerVaultABI.accumulatedFeesAssets, permitFailure: true})
        
        const interestAccumulatorStart = await fromApi.call({target: vault, abi: eulerVaultABI.interestAccumulator, permitFailure: true})
        const interestAccumulatorEnd = await toApi.call({target: vault, abi: eulerVaultABI.interestAccumulator, permitFailure: true})
        const totalBorrow = await fromApi.call({target: vault, abi: eulerVaultABI.totalBorrows, permitFailure: true})

        const dailyInterest = totalBorrow * (interestAccumulatorEnd - interestAccumulatorStart) / interestAccumulatorStart

        const logsVaultStatus = await getLogs({
            target: vault, 
            eventAbi: eulerVaultABI.vaultStatus, 
        });

        logsVaultStatus.sort((a, b) => Number(a.timestamp) - Number(b.timestamp));

        // we listen for the convert fees event otherwise if convert fees happened accumulatedfees will be 0 and mess every thing up Daily Revenue = accumulatedFees + sum(converted_fees)
        const logs = await getLogs({target: vault, eventAbi: eulerVaultABI.convertFees})
        const convertShares = await Promise.all(logs.map(async (log: any) => {
            const shares = log.protocolShares + log.governorShares;
            const assets = await api.call({
            target: vault,
            abi: eulerVaultABI.convertToAssets,
            params: [shares],
            permitFailure: false,
            });
            return Number(assets);
        }));
        const totalConvertedAmount = convertShares.reduce((sum, amount) => sum + amount, 0);
       
        const accumulatedFees = (accumulatedFeesEnd - accumulatedFeesStart) + totalConvertedAmount
  
        dailyFees.add(underlying, dailyInterest)
        dailyRevenue.add(underlying, accumulatedFees)
    }))
   
    return {
        dailyFees,
        dailyRevenue
    }
}

const fetch = async (options: FetchOptions) => {
    return await getVaults(options, {})
}

const adapters: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            start: '2024-08-14'
        },
        [CHAIN.SONIC]: {
            fetch: fetch,
            start: '2025-01-25'
        },
        [CHAIN.BASE]: {
            fetch: fetch,
            start: '2024-11-11'
        }
    },
    version: 2
}

export default adapters;