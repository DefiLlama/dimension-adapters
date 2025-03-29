import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import * as sdk from "@defillama/sdk";

//cian yield layer doesn't have factory, so we hardcode the vaults
const cianVaults = {
    [CHAIN.ETHEREUM]: {
        // "ylstETH Scroll Vault": "0x3498fDed9C88Ae83b3BC6a302108F2da408e613b", this one doesn't have vaultParams and no fee getter, but curiously the website shows 10% fee 
        "stETH Yield Layer": "0xB13aa2d0345b0439b064f26B82D8dCf3f508775d",
        "rsETH Yield Layer": "0xd87a19fF681AE98BF10d2220D1AE3Fbd374ADE4e",
        "BTCLST Yield Layer": "0x6c77bdE03952BbcB923815d90A73a7eD7EC895D1",
        "FBTC Yield Layer": "0x8D76e7847dFbEA6e9F4C235CADF51586bA3560A2",
        "ezETH Yield Layer": "0x3D086B688D7c0362BE4f9600d626f622792c4a20",
        "uniBTC Yield Layer": "0xcc7E6dE27DdF225E24E8652F62101Dab4656E20A",
        "cbBTC Yield Layer": "0x7BA7c46e9F44d93AEF0Ddd37b80134438f60e15e",
        "pumpBTC Yield Layer": "0xd4Cc9b31e9eF33E392FF2f81AD52BE8523e0993b",
        // "LRT Yield Layer - steakLRT": "0x30282284Fc5290a049427ca01bB81A331A9F8107",
        // "LRT Yield Layer - rstETH": "0x7CB6Bb4320622B85b265f596a4AD9f7Cc85F8797", these two doesn't have verified contract so we skip them
        "fBTC Yield Layer Ⅲ": "0x9fdDAD44eD6b77e6777dC1b16ee4FCcCBaF0A019"
    },
    [CHAIN.ARBITRUM]: {
        "rsETH Yield Layer": "0x15cbFF12d53e7BdE3f1618844CaaEf99b2836d2A",
    },
    [CHAIN.BSC]: {
        "slisBNB Yield Layer": "0x406e1e0e3cb4201B4AEe409Ad2f6Cd56d3242De7"
    }
    // [CHAIN.SEI]: {
    //     "redBTC Yield Layer": "0xff6771a9565F18638faB2972BA7Fc798ad8bCad0"
    // }
}

const cianVaultABI = {
    getVaultParams: "function getVaultParams() view returns (tuple(address underlyingToken, string name, string symbol, uint256 marketCapacity, uint256 managementFeeRate, uint256 managementFeeClaimPeriod, uint256 maxPriceUpdatePeriod, uint256 revenueRate, uint256 exitFeeRate, address admin, address rebalancer, address feeReceiver, address redeemOperator))",
    totalAssets: "function totalAssets() view returns (uint256)",
    updateExchangePrice: "event UpdateExchangePrice(uint256 newExchangePrice, uint256 newRevenue)",
    collectManagementFee: "event CollectManagementFee(uint256 managementFee)",
}

const fetch = async ({createBalances, api, getLogs, chain}: FetchOptions) => {
    const dailyFees = createBalances()
    // call the vaults
    const vaults = Object.values(cianVaults[chain]) as string[]
    
    const vaultsParams = (await api.multiCall({
        abi: cianVaultABI.getVaultParams,
        calls: vaults,
        permitFailure: true
    })).map((params) => ({
        token: params.underlyingToken,
        revenueRate: params.revenueRate
    }))

    const vaultsUpdateExchangePrice = (await getLogs({
        targets: vaults,
        eventAbi: cianVaultABI.updateExchangePrice,
        flatten: false
    })).map((logs) => {
        return logs.reduce((totalRevenue, log) => totalRevenue + log.newRevenue, 0n);
    });

    const vaultsManagementFee = (await getLogs({
        targets: vaults,
        eventAbi: cianVaultABI.collectManagementFee,
        flatten: false
    })).map((logs) => {
        return logs.reduce((totalManagement, log) => totalManagement + log.managementFee, 0n);
    });

    vaultsUpdateExchangePrice.forEach((data, i) => {
        dailyFees.add(vaultsParams[i].token, data)
    })
    vaultsManagementFee.forEach((data, i) => {
        dailyFees.add(vaultsParams[i].token, data)
    })

    return {dailyFees, dailyRevenue: dailyFees}
}

const methodology = {
    dailyFees: "Management & Performance fee paid by users",
    dailyRevenue: "Management & Performance fee paid by users"
}

const adapters: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
            meta: {
                methodology
            }
        },
        [CHAIN.BSC]: {
            fetch: fetch,
            meta: {
                methodology
            }
        },
        [CHAIN.ARBITRUM]: {
            fetch: fetch,
            meta: {
                methodology
            }
        },
        // [CHAIN.SEI]: {
        //     fetch: fetch,
        //     start: '2025-01-31',
        //     meta: {
        //         methodology
        //     }
        // }
    },
    
    version: 2
}

export default adapters;