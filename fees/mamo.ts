import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addTokensReceived } from "../helpers/token";
import ADDRESSES from "../helpers/coreAssets.json";

const MAMO_MULTI_REWARDS = "0x7855B0821401Ab078f6Cf457dEAFae775fF6c7A3";
const MAMO_TOKEN = "0x7300B37DfdfAb110d83290A29DfB31B1740219fE";
const MAMO_STRATEGY_REGISTRY = "0x46a5624C2ba92c08aBA4B206297052EDf14baa92";

// Per-asset config hardcoded from mamo-contracts/addresses/8453.json
const CONFIGS = [
    {
        mToken: "0xEdc817A28E8B93B03976FBd4a3dDBc9f7D176c22", // Moonwell mUSDC
        morphoVault: "0xc1256Ae5FF1cf2719D4937adb3bbCCab2E00A2Ca", // Moonwell Flagship USDC
        underlying: ADDRESSES.base.USDC,
        underlyingDecimals: 6,

    },
    {
        mToken: "0xF877ACaFA28c19b96727966690b2f44d35aD5976", // Moonwell mcbBTC
        morphoVault: "0x543257eF2161176D7C8cD90BA65C2d4CaEF5a796", // MetaMorpho cbBTC
        underlying: ADDRESSES.base.cbBTC,
        underlyingDecimals: 8,
    },
    {
        mToken: "0x628ff693426583D9a7FB391E54366292F509D457", // Moonwell mWETH
        morphoVault: "0xa0E430870c4604CcfC7B38Ca7845B1FF653D0ff1", // MetaMorpho WETH
        underlying: ADDRESSES.base.WETH,
        underlyingDecimals: 18,
    },
];

const STRATEGY_CREATED = "event StrategyCreated(address indexed user, address indexed strategy)";
const STRATEGY_ADDED = "event StrategyAdded (address indexed user, address strategy, address implementation)";
const STRATEGY_DEPLOYED_BLOCK = 30235637;

const fetch = async (options: FetchOptions) => {
    const dailySupplySideRevenue = options.createBalances();

    const strategies = await options.getLogs({
        target: MAMO_STRATEGY_REGISTRY,
        eventAbi: STRATEGY_ADDED,
        fromBlock: STRATEGY_DEPLOYED_BLOCK,
        cacheInCloud: true,
    })

    const mTokens = await options.api.multiCall({
        abi: "address:mToken",
        calls: strategies.map((s) => ({ target: s.strategy })),
        permitFailure: true,
    })

    const morphoVaults = await options.api.multiCall({
        abi: "address:metaMorphoVault",
        calls: strategies.map((s) => ({ target: s.strategy })),
        permitFailure: true,
    })

    const mTokenToStrategies = new Map<string, typeof strategies>()
    mTokens.forEach((mToken, index) => {
        if (mToken) {
            const existing = mTokenToStrategies.get(mToken) || []
            existing.push(strategies[index])
            mTokenToStrategies.set(mToken, existing)
        }
    })

    const morphoVaultToStrategies = new Map<string, typeof strategies>()
    morphoVaults.forEach((morphoVault, index) => {
        if (morphoVault) {
            const existing = morphoVaultToStrategies.get(morphoVault) || []
            existing.push(strategies[index])
            morphoVaultToStrategies.set(morphoVault, existing)
        }
    })

    const [mTokenPriceBeforeArray, mTokenPriceAfterArray] = await Promise.all([
        options.fromApi.multiCall({
            abi: "function exchangeRateStored() view returns (uint256)",
            calls: CONFIGS.map((c) => ({ target: c.mToken })),
            permitFailure: true,
        }),
        options.toApi.multiCall({
            abi: "function exchangeRateStored() view returns (uint256)",
            calls: CONFIGS.map((c) => ({ target: c.mToken })),
            permitFailure: true,
        }),
    ])

    const PRICE_QUERY = "1000000000000000000";

    const [morphoVaultPriceBeforeArray, morphoVaultPriceAfterArray] = await Promise.all([
        options.fromApi.multiCall({
            abi: "function convertToAssets(uint256) view returns (uint256)",
            calls: CONFIGS.map((c) => ({ target: c.morphoVault, params: [PRICE_QUERY] })),
            permitFailure: true,
        }),
        options.toApi.multiCall({
            abi: "function convertToAssets(uint256) view returns (uint256)",
            calls: CONFIGS.map((c) => ({ target: c.morphoVault, params: [PRICE_QUERY] })),
            permitFailure: true,
        }),
    ])


    let index = 0;
    for (let i = 0; i < CONFIGS.length; i++) {
        const config = CONFIGS[i];
        const mTokenExchangeRateDecimals = 18 + config.underlyingDecimals - 8;
        const mTokenPriceBefore = mTokenPriceBeforeArray[i] / 10 ** mTokenExchangeRateDecimals;
        const mTokenPriceAfter = mTokenPriceAfterArray[i] / 10 ** mTokenExchangeRateDecimals;
        const morphoVaultPriceBefore = morphoVaultPriceBeforeArray[i] / 10 ** config.underlyingDecimals;
        const morphoVaultPriceAfter = morphoVaultPriceAfterArray[i] / 10 ** config.underlyingDecimals

        const strategies = mTokenToStrategies.get(config.mToken);

        if (!strategies || !mTokenPriceBefore || !mTokenPriceAfter || !morphoVaultPriceBefore || !morphoVaultPriceAfter) continue;

        const strategyMtokenBalances = await options.api.multiCall({
            abi: "function balanceOf(address) view returns (uint256)",
            calls: strategies.map((s) => ({ target: config.mToken, params: [s] })),
            permitFailure: true,
        })
        const strategyMorphoVaultBalances = await options.api.multiCall({
            abi: "function balanceOf(address) view returns (uint256)",
            calls: strategies.map((s) => ({ target: config.morphoVault, params: [s] })),
            permitFailure: true,
        })

        const totalMTokenBalance = strategyMtokenBalances.reduce((sum, balance) => sum + Number(balance ?? 0) / 10 ** 8, 0);
        const totalMorphoVaultBalance = strategyMorphoVaultBalances.reduce((sum, balance) => sum + Number(balance ?? 0) / 10 ** config.underlyingDecimals, 0);

        dailySupplySideRevenue.add(config.underlying, (mTokenPriceAfter - mTokenPriceBefore) * totalMTokenBalance, 'Moonwell Yield');
        dailySupplySideRevenue.add(config.underlying, (morphoVaultPriceAfter - morphoVaultPriceBefore) * totalMorphoVaultBalance, 'MetaMorpho Yield');
        index++;
    }

    // Aerodrome LP fees distributed to MAMO stakers
    const dailyHoldersRevenue = await addTokensReceived({
        options,
        targets: [MAMO_MULTI_REWARDS],
        tokens: [MAMO_TOKEN, ADDRESSES.base.cbBTC],
    });

    const dailyFees = options.createBalances();
    dailyFees.addBalances(dailySupplySideRevenue);
    dailyFees.addBalances(dailyHoldersRevenue);

    return {
        dailyFees,
        dailyRevenue: dailyHoldersRevenue,
        dailySupplySideRevenue,
        dailyHoldersRevenue,
    };
};

const methodology = {
    Fees: "Yield earned by Mamo strategy depositors from Moonwell/MetaMorpho positions plus Aerodrome LP fees distributed to MAMO stakers.",
    SupplySideRevenue: "Interest accrued on user deposits via Moonwell mToken exchange rate growth and MetaMorpho vault share price growth.",
    HoldersRevenue: "Aerodrome LP trading fees distributed to MAMO stakers via the multi-rewards contract.",
}

const breakdownMethodology = {
    Fees: {
        'Moonwell Yield': 'Interest accrued on strategy deposits in Moonwell mToken markets (USDC/WETH/cbBTC), measured via exchangeRateStored delta.',
        'MetaMorpho Yield': 'Yield from MetaMorpho vault share price appreciation on strategy deposits (USDC/WETH/cbBTC), measured via convertToAssets delta.',
        'Aerodrome LP Fees': 'Aerodrome LP trading fees distributed to MAMO stakers via the multi-rewards contract.',
    },
    SupplySideRevenue: {
        'Moonwell Yield': 'Interest accrued on strategy deposits in Moonwell mToken markets (USDC/WETH/cbBTC), measured via exchangeRateStored delta.',
        'MetaMorpho Yield': 'Yield from MetaMorpho vault share price appreciation on strategy deposits (USDC/WETH/cbBTC), measured via convertToAssets delta.',
    },
    HoldersRevenue: {
        'Aerodrome LP Fees': 'Aerodrome LP trading fees distributed to MAMO stakers via the multi-rewards contract.',
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    chains: [CHAIN.BASE],
    fetch,
    start: "2025-05-14",
    methodology,
    breakdownMethodology,
};

export default adapter;
