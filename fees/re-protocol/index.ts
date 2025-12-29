import { Chain, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

type ProtocolAddresses = {
    primaryToken: string
    primaryPriceFeed: string
    secondaryToken?: string
    secondaryPriceFeed?: string
    treasuryVault: string
}

const networkConfigurations: Partial<Record<Chain, ProtocolAddresses>> = {
    [CHAIN.ETHEREUM]: {
        primaryToken: "0x5086bf358635B81D8C47C66d1C8b9E567Db70c72",
        primaryPriceFeed: "0xd1D104a7515989ac82F1AFDa15a23650411b05B8",
        secondaryToken: "0xdDC0f880ff6e4e22E4B74632fBb43Ce4DF6cCC5a",
        secondaryPriceFeed: "0x1262A408DE54DB9ae3Fb3BB0e429C319fbEE9915",
        treasuryVault: "0x2DF87810fCF9b8e6a42adC5923Bc2EE0ca0467CA"
    },
    [CHAIN.AVAX]: {
        primaryToken: "0x180aF87b47Bf272B2df59dccf2D76a6eaFa625Bf",
        primaryPriceFeed: "0xdC481e538125a8542D3eC262d40415328f1b16C0",
        treasuryVault: "0xa7087c87028E8ecE44d867d8b822a3Ed21eD4ef7"
    },
    [CHAIN.ARBITRUM]: {
        primaryToken: "0x76cE01F0Ef25AA66cC5F1E546a005e4A63B25609",
        primaryPriceFeed: "0x5cD24d20E2F3C6742Be752Cb0f8c2531cA3b7425",
        treasuryVault: "0xBa16Fe5B0FC7344cfe649Dd60A05564cDc0bc7dF"
    },
    [CHAIN.BASE]: {
        primaryToken: "0x7D214438D0F27AfCcC23B3d1e1a53906aCE5CFEa",
        primaryPriceFeed: "0xcE53791EbFC01c68feFABe4fA6c257Bfb550CFAb",
        treasuryVault: "0x6D70D88BF47F26e9F3426Fb4ACaB663d1aAF6901"
    }
}

const feeCollectionEvent = "event FeeRecorded(address indexed token, uint256 amount)"

const calculateYieldFees = async (
    apiOptions: FetchOptions,
    assetAddress: string,
    oracleAddress: string
): Promise<number> => {
    const [previousRate, currentRate, circulatingSupply] = await Promise.all([
        apiOptions.fromApi.call({ abi: 'uint256:getSharePrice', target: oracleAddress }),
        apiOptions.toApi.call({ abi: 'uint256:getSharePrice', target: oracleAddress }),
        apiOptions.toApi.call({ abi: 'uint256:totalSupply', target: assetAddress })
    ])

    const rateDifference = (Number(currentRate) - Number(previousRate)) / 1e18
    const totalYieldFees = rateDifference * Number(circulatingSupply) / 1e18

    return totalYieldFees
}

const processFeeData = async (apiOptions: FetchOptions) => {
    const feeBalances = apiOptions.createBalances()
    const protocolRevenue = apiOptions.createBalances()
    const liquidityProviderRewards = apiOptions.createBalances()
    const transactionFees = apiOptions.createBalances()

    const chainConfig = networkConfigurations[apiOptions.chain]!

    // Calculate primary token yield fees
    const primaryTokenYield = await calculateYieldFees(
        apiOptions,
        chainConfig.primaryToken,
        chainConfig.primaryPriceFeed
    )

    feeBalances.addUSDValue(primaryTokenYield, METRIC.ASSETS_YIELDS)
    liquidityProviderRewards.addUSDValue(primaryTokenYield, METRIC.ASSETS_YIELDS)

    // Handle secondary token if available
    if (chainConfig.secondaryToken && chainConfig.secondaryPriceFeed) {
        const secondaryTokenYield = await calculateYieldFees(
            apiOptions,
            chainConfig.secondaryToken,
            chainConfig.secondaryPriceFeed
        )

        feeBalances.addUSDValue(secondaryTokenYield, METRIC.ASSETS_YIELDS)
        liquidityProviderRewards.addUSDValue(secondaryTokenYield, METRIC.ASSETS_YIELDS)
    }

    // Process recorded transaction fees
    const recordedFeeEvents = await apiOptions.getLogs({
        target: chainConfig.treasuryVault,
        eventAbi: feeCollectionEvent
    })

    recordedFeeEvents.forEach(eventLog =>
        transactionFees.add(eventLog.token, eventLog.amount, METRIC.MINT_REDEEM_FEES)
    )

    // Combine all fee types
    feeBalances.addBalances(transactionFees)
    protocolRevenue.addBalances(transactionFees)

    return {
        dailyFees: feeBalances,
        dailyRevenue: protocolRevenue,
        dailySupplySideRevenue: liquidityProviderRewards,
        dailyUserFees: transactionFees
    }
}

const reProtocolAdapter: SimpleAdapter = {
    version: 2,
    fetch: processFeeData,
    chains: [CHAIN.ETHEREUM, CHAIN.AVAX, CHAIN.ARBITRUM, CHAIN.BASE],
    methodology: {
        Fees: "Protocol fees from asset yields and redemption charges",
        Revenue: "Management and performance fees collected by the protocol",
        SupplySideRevenue: "Yield distributions allocated to liquidity providers",
        UserFees: "Transaction fees charged on minting and redemption operations",
    }
}

export default reProtocolAdapter