import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

const APYUSD_VAULT = "0x38EEb52F0771140d10c4E9A9a72349A329Fe8a6A"
const APXUSD = "0x98A878b1Cd98131B271883B390f68D2c90674665"
const APX_UNLOCK = "0x93775E2dFa4e716c361A1f53F212c7AE031BF4e6"

const redeemRequestAbi = "event RedeemRequest(address indexed controller, address indexed owner, uint256 indexed requestId, address sender, uint256 assets)";

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()
    const dailyRevenue = options.createBalances()

    const [oldAssets, newAssets, oldShares, newShares] = await Promise.all([
        options.fromApi.call({ abi: "uint256:totalAssets", target: APYUSD_VAULT }),
        options.toApi.call({ abi: "uint256:totalAssets", target: APYUSD_VAULT }),
        options.fromApi.call({ abi: "uint256:totalSupply", target: APYUSD_VAULT }),
        options.toApi.call({ abi: "uint256:totalSupply", target: APYUSD_VAULT }),
    ])

    const oldPrice = Number(oldShares) > 0 ? Number(oldAssets) / Number(oldShares) : 1
    const newPrice = Number(newShares) > 0 ? Number(newAssets) / Number(newShares) : 1
    const yieldUsd = (newPrice - oldPrice) * Number(newShares) / 1e18

    dailyFees.addUSDValue(yieldUsd, METRIC.ASSETS_YIELDS)
    dailySupplySideRevenue.addUSDValue(yieldUsd, METRIC.ASSETS_YIELDS)

    const redeemRequests = await options.getLogs({
        target: APX_UNLOCK,
        eventAbi: redeemRequestAbi,
    })

    for (const log of redeemRequests) {
        dailyFees.add(APXUSD, Number(log.assets) / 1000, METRIC.MINT_REDEEM_FEES)
        dailyRevenue.add(APXUSD, Number(log.assets) / 1000, METRIC.MINT_REDEEM_FEES)
    }

    return {
        dailyFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}

const methodology = {
    Fees: "Total yield earned on RWA backing assets (share price appreciation) plus withdrawal fees (0.1% unlocking fee on apyUSD redemptions).",
    SupplySideRevenue: "Yield distributed to apyUSD vault depositors via share price appreciation.",
    Revenue: "0.1% unlocking fee on apyUSD redemptions.",
    ProtocolRevenue: "All the revenue goes to the protocol",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: "Total yield earned on RWA backing assets (share price appreciation).",
        [METRIC.MINT_REDEEM_FEES]: "Withdrawal fees (0.1% unlocking fee on apyUSD redemptions).",
    },
    Revenue: {
        [METRIC.MINT_REDEEM_FEES]: "0.1% unlocking fee on apyUSD redemptions.",
    },
    ProtocolRevenue: {
        [METRIC.MINT_REDEEM_FEES]: "All the revenue goes to the protocol",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yield distributed to apyUSD vault depositors via share price appreciation.",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.ETHEREUM],
    fetch,
    start: "2026-02-17",
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
}

export default adapter
