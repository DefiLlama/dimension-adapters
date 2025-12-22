import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const vaults = {
    brUSDC: {address: '0xb8ca40E2c5d77F0Bc1Aa88B2689dddB279F7a5eb', managementFee: 0.015, performanceFee: 0.30}, //  USDC+ Vault
    brETH: {address: '0x3588e6Cb5DCa99E35bA2E2a5D42cdDb46365e71B', managementFee: 0.01, performanceFee: 0.15 }, // ETH+ Vault
    bravUSDC: {address: '0x9f96E4B65059b0398B922792d3fF9F10B4567533', managementFee: 0.015, performanceFee: 0.20} // Avant+ Vault
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const vaultAddresses = Object.values(vaults).map(vault => vault.address)
    const vaultFees = Object.values(vaults)
    const [assets, values, decimals] = await Promise.all([
        options.api.multiCall({ abi: 'address:token', calls: vaultAddresses, permitFailure: true}),
        options.api.multiCall({ abi: 'uint256:totalSupply', calls: vaultAddresses, permitFailure: true}),
        options.api.multiCall({ abi: 'uint8:decimals', calls: vaultAddresses, permitFailure: true})
    ])
    const convertCalls = vaultAddresses.map((vault, index) => {
        return {
        target: vault,
        params: [String(10 ** Number(decimals[index]))],
        }
    })
    const cumulativeIndexBefore = await options.fromApi.multiCall({ abi: 'function convertToAssets(uint256) view returns (uint256)', calls: convertCalls, permitFailure: true, })
    const cumulativeIndexAfter = await options.toApi.multiCall({ abi: 'function convertToAssets(uint256) view returns (uint256)', calls: convertCalls, permitFailure: true, })

    for (let i = 0; i < assets.length; i++) {
        const token = assets[i]
        const value = values[i]
        const decimal = decimals[i]
        const cumulativeIndexBeforeValue = cumulativeIndexBefore[i]
        const cumulativeIndexAfterValue = cumulativeIndexAfter[i]
        if (token && value && decimal && cumulativeIndexBeforeValue && cumulativeIndexAfterValue) {
            const totalTokenBalance = Number(value)
            const growthCumulativeIndex = Number(cumulativeIndexAfterValue) - Number(cumulativeIndexBeforeValue)
            const growthInterest = growthCumulativeIndex * totalTokenBalance / (10 ** Number(decimal))
            dailyFees.add(token, growthInterest)
            const performanceFee = vaultFees[i].performanceFee
            dailyProtocolRevenue.add(token, growthInterest * performanceFee, METRIC.PERFORMANCE_FEES)
            dailySupplySideRevenue.add(token, growthInterest - (growthInterest * performanceFee))
            dailyRevenue.add(token, growthInterest, METRIC.ASSETS_YIELDS)
            const currentPeriod = options.toTimestamp - options.fromTimestamp
            const managementFees = value * vaultFees[i].managementFee * currentPeriod / (365 * 24 * 3600)
            dailyProtocolRevenue.add(token, managementFees, METRIC.MANAGEMENT_FEES)
        }
    }
    return {
        dailyFees: dailyFees,
        dailyRevenue: dailyRevenue,
        dailyProtocolRevenue: dailyProtocolRevenue,
        dailySupplySideRevenue: dailySupplySideRevenue,
    }
}

const methodology = {
    Fees: "The yield generated from deposited assets in all vaults",
    Revenue: "The yield generated from deposited assets in all vaults",
    ProtocolRevenue: "Management and performance fees charged by the protocol",
    SupplySideRevenue: "The yield earned by vault users minus the protocol fee"
}

const adapter: Adapter = {
    version: 2,
    fetch: fetch,
    chains: [CHAIN.ETHEREUM],
    methodology: methodology,
    start: "2025-06-01"
}

export default adapter