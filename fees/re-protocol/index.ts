import { Chain, FetchOptions, SimpleAdapter } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import { METRIC } from "../../helpers/metrics"

interface chainContractsInterface {
    reUsd: string,
    reUsdPriceCalculator: string,
    reUsde?: string,
    reUsdePriceCalculator?: string
    feeVault: string
}

const contracts: Record<Chain,chainContractsInterface>  = {
    [CHAIN.ETHEREUM]: {
        reUsd: "0x5086bf358635B81D8C47C66d1C8b9E567Db70c72",
        reUsdPriceCalculator: "0xd1D104a7515989ac82F1AFDa15a23650411b05B8",
        reUsde: "0xdDC0f880ff6e4e22E4B74632fBb43Ce4DF6cCC5a",
        reUsdePriceCalculator: "0x1262A408DE54DB9ae3Fb3BB0e429C319fbEE9915",
        feeVault: "0x2DF87810fCF9b8e6a42adC5923Bc2EE0ca0467CA"
    },
    [CHAIN.AVAX]: {
        reUsd: "0x180aF87b47Bf272B2df59dccf2D76a6eaFa625Bf",
        reUsdPriceCalculator: "0xdC481e538125a8542D3eC262d40415328f1b16C0",
        feeVault: "0xa7087c87028E8ecE44d867d8b822a3Ed21eD4ef7"
    },
    [CHAIN.ARBITRUM]: {
        reUsd: "0x76cE01F0Ef25AA66cC5F1E546a005e4A63B25609",
        reUsdPriceCalculator: "0x5cD24d20E2F3C6742Be752Cb0f8c2531cA3b7425",
        feeVault: "0xBa16Fe5B0FC7344cfe649Dd60A05564cDc0bc7dF"
    },
    [CHAIN.BASE]: {
        reUsd: "0x7D214438D0F27AfCcC23B3d1e1a53906aCE5CFEa",
        reUsdPriceCalculator: "0xcE53791EbFC01c68feFABe4fA6c257Bfb550CFAb",
        feeVault: "0x6D70D88BF47F26e9F3426Fb4ACaB663d1aAF6901"

    }
}
const feeRecordedEvent = "event FeeRecorded(address indexed token, uint256 amount)"

async function getFees(options: FetchOptions, token: string, priceCalculator: string) {
    const [rateFrom, rateTo, totalSupply] = await Promise.all([
        options.fromApi.call({ abi: 'uint256:getSharePrice', target: priceCalculator}),
        options.toApi.call({ abi: 'uint256:getSharePrice', target: priceCalculator}),
        options.toApi.call({ abi: 'uint256:totalSupply', target: token})
    ])
    const rate = (Number(rateTo) - Number(rateFrom)) / 1e18
    const fees = rate * totalSupply / 1e18
    return fees
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyUserFees = options.createBalances()

    const { reUsd, reUsde, reUsdPriceCalculator, reUsdePriceCalculator, feeVault } = contracts[options.chain]
    const reUsdFees = await getFees(options, reUsd, reUsdPriceCalculator)
    dailyFees.addUSDValue(reUsdFees, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.addUSDValue(reUsdFees, METRIC.ASSETS_YIELDS)
    if (reUsde && reUsdePriceCalculator) {
        const reUsdeFees = await getFees(options, reUsde, reUsdePriceCalculator)
        dailyFees.addUSDValue(reUsdeFees, METRIC.ASSETS_YIELDS)
        dailySupplySideRevenue.addUSDValue(reUsdeFees, METRIC.ASSETS_YIELDS)
    }
    const feesRecorded = await options.getLogs({ target: feeVault, eventAbi: feeRecordedEvent })
    feesRecorded.forEach(log => dailyUserFees.add(log.token, log.amount, METRIC.MINT_REDEEM_FEES))
    dailyFees.addBalances(dailyUserFees)
    dailyRevenue.addBalances(dailyUserFees)

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyUserFees
    }
}

const adapter : SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM, CHAIN.AVAX, CHAIN.ARBITRUM, CHAIN.BASE],
    allowNegativeValue: true,
    methodology: {
        Fees: "The yield generated from deposited assets",
        Revenue: "The redemption fees. The protocol charges a management and performance fee, but the actual percentages are not disclosed",
        SupplySideRevenue: "The yield generated from deposited assets are distributed to reUsd and reUSDe",
        UserFees: "There's a 18 bps fee on redemptions",
    }
}

export default adapter