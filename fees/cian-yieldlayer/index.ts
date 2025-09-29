import { Adapter, FetchOptions } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"

//cian yield layer doesn't have factory, so we hardcode the vaults
const cianVaults = {
    [CHAIN.ETHEREUM]: [
        "0xB13aa2d0345b0439b064f26B82D8dCf3f508775d",
        "0xd87a19fF681AE98BF10d2220D1AE3Fbd374ADE4e",
        "0x9fdDAD44eD6b77e6777dC1b16ee4FCcCBaF0A019",
        "0x6c77bdE03952BbcB923815d90A73a7eD7EC895D1",
        "0xcc7E6dE27DdF225E24E8652F62101Dab4656E20A",
        "0xd4Cc9b31e9eF33E392FF2f81AD52BE8523e0993b",
        "0x3D086B688D7c0362BE4f9600d626f622792c4a20",
    
        // bera 
    
        "0x6dD1736E15857eE65889927f40CE3cbde3c59Cb2", // rseth
        "0x83B5ab43b246F7afDf465103eb1034c8dfAf36f2", // pumpbtc
        "0xf7cb66145c5Fbc198cD4E43413b61786fb12dF95", // unibtc
        "0x699f698Ad986075734167A875997e1a367C01a8d", // cbbtc
        "0xC8C3ABB76905caD1771448B5520F052FE83e8B0E", // wbeth
        "0xEFe4c96820F24c4BC6b2D621fD5FEb2B46adC1Df", // usda
        "0xe4794e30AA190baAA953D053fC74b5e50b3575d7", // susda
        "0x0186b03AC7C14a90d04D2b1e168869F618D149c5", // ylpumpbtc
        "0x16c6B81Eb1B148326dc6D0bFCE472f68F3518187", // ylunibtc
        "0x8073588bdfe8DBf0375e57425A29E8dC4003C3E6", // ylrseth
        "0x0A9Ea3a5A26ac80535046F0Fd004523CF5c03bb5", // wsteth
        "0xc71FB1bC07a65375121cdea87AD401207dD745b8", // ylBTCLST

        // sei
        "0x7fF67093231CE8DBC70c0A65b629ed080e66a7F0", // pumpbtc
        "0xe5DfcE87E75e92C61aeD31329716Cf3D85Cd9C8c", // ylBTCLST

        // LST contract not verified, getVaultParams also doesn't work
        // "0xcDd374F491fBF3f4FcF6E9023c99043774005137",
        // "0xB8c0c50D255B93f5276549cbA7F4bf78751A5D34",
        // "0x88508306E43FCe43F7f2c1e7D73c88cf6a523f6C",
        // "0xD34f59E172cF3915f56C96A3037Ac554A7399D77", // PYUSD Optimized Long-Short (variant 1)
        // lfbtc-cian-eth
        // "0x821d2e44984168d278C698fD742d5138c01bAAA2"  // lfbtc-cian-eth
    
      ],
    // [CHAIN.ARBITRUM]: ["0xE946Dd7d03F6F5C440F68c84808Ca88d26475FC5", "0xED5f727107BdAC99443bAE317E0eF38239719e87", '0x15cbFF12d53e7BdE3f1618844CaaEf99b2836d2A'], contract not verified
    [CHAIN.BSC]: [ "0x406e1e0e3cb4201B4AEe409Ad2f6Cd56d3242De7"], 
        //"0xEa5f10A0E612316A47123D818E2b597437D19a17",
    // [CHAIN.OPTIMISM]: ["0x907883da917ca9750ad202ff6395C4C6aB14e60E"],
    // [CHAIN.BASE]: ["0x9B2316cfe980515de7430F1c4E831B89a5921137"],
    // [CHAIN.SCROLL]: ["0xEa5f10A0E612316A47123D818E2b597437D19a17"]
}

const cianVaultABI = {
    getVaultParams: "function getVaultParams() view returns (tuple(address underlyingToken, string name, string symbol, uint256 marketCapacity, uint256 managementFeeRate, uint256 managementFeeClaimPeriod, uint256 maxPriceUpdatePeriod, uint256 revenueRate, uint256 exitFeeRate, address admin, address rebalancer, address feeReceiver, address redeemOperator))",
    totalAssets: "function totalAssets() view returns (uint256)",
    updateExchangePrice: "event UpdateExchangePrice(uint256 newExchangePrice, uint256 newRevenue)",
    collectManagementFee: "event CollectManagementFee(uint256 managementFee)",
    underlyingTvl: "function underlyingTvl() view returns (uint256)",
    exchangePrice: "function exchangePrice() view returns (uint256)",
    totalSupply: "function totalSupply() view returns (uint256)",
    depositEvent: "event Deposit(address indexed sender, address indexed owner, uint256 assets, uint256 shares)",
    optionalRedeemEvent: "event OptionalRedeem(address token, uint256 shares, address receiver, address owner)",
}

const fetch = async ({createBalances, api, getLogs, fromApi, toApi, chain}: FetchOptions) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    // call the vaults
    const vaults = Object.values(cianVaults[chain]) as string[]
    
    const vaultsParamsAll = await api.multiCall({
        abi: cianVaultABI.getVaultParams,
        calls: vaults,
        permitFailure: true
    });
    
    const validVaults = vaultsParamsAll.map((params, i) => {
        if (!params) return null;
        return {
            token: params.underlyingToken,
            revenueRate: params.revenueRate,
            managementFeeRate: params.managementFeeRate,
            vault: vaults[i],
        };
    }).filter(v => v !== null);
    
    if (validVaults.length === 0) return {dailyFees, dailyRevenue};
    
    const validVaultAddresses = validVaults.map(v => v.vault);

    const vaultsUpdateExchangePrice = (await getLogs({
        targets: validVaultAddresses,
        eventAbi: cianVaultABI.updateExchangePrice,
        flatten: false
    })).map((logs) => {
        return logs.reduce((totalRevenue, log) => totalRevenue + log.newRevenue, 0n);
    });

    const vaultsManagementFee = (await getLogs({
        targets: validVaultAddresses,
        eventAbi: cianVaultABI.collectManagementFee,
        flatten: false
    })).map((logs) => {
        return logs.reduce((totalManagement, log) => totalManagement + log.managementFee, 0n);
    });

    vaultsUpdateExchangePrice.forEach((data, i) => {
        if(validVaults[i].revenueRate == 0) return;
        const yieldValue = data * BigInt(1e4) / BigInt(validVaults[i].revenueRate);
        dailyFees.add(validVaults[i].token, yieldValue);
        dailyRevenue.add(validVaults[i].token, data);
    });
    
    vaultsManagementFee.forEach((data, i) => {
        if(validVaults[i].managementFeeRate == 0) return;
        const yieldValue = data * BigInt(1e4) / BigInt(validVaults[i].managementFeeRate);
        dailyFees.add(validVaults[i].token, yieldValue);
        dailyRevenue.add(validVaults[i].token, data);
    });

    return {dailyFees, dailyRevenue};
}

const methodology = {
    Fees: "Yield generated by the vaults",
    Revenue: "Management & Performance fee paid by users"
}

const adapters: Adapter = {
    methodology,
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: fetch,
        },
    },
    
    version: 2
}

export default adapters;