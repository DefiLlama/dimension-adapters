import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { Balances } from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        start: '2025-04-01',
        address: "0x491EDFB0B8b608044e227225C715981a30F3A44E",
        centrifugeVaults: [
            {
                token: "0x8c213ee79581ff4984583c6a801e5263418c4b86",
                vault: "0xfe6920eb6c421f1179ca8c8d4170530cdbdfd77a",
                name: "JSTRY",
                tokenDecimals: 6,
                assetDecimals: 6
            },
            {
                token: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
                vault: "0x4880799ee5200fc58da299e965df644fbf46780b",
                name: "JAAA",
                tokenDecimals: 6,
                assetDecimals: 6,
                badDataDays: ["2025-07-28"]
            },
        ],
        aaveHorizonVaults: [
            {
                aToken: "0xE3190143Eb552456F88464662f0c0C4aC67A77eB",
                underlying: "0x8292Bb45bf1Ee4d140127049757C2E0fF06317eD",
                name: "Aave Horizon RLUSD",
                badDataDays: ["2025-11-04"]
            }
        ],
        securitizeVaults: [
            {
                token: "0x6a9DA2D710BB9B700acde7Cb81F10F1fF8C89041",
                priceFeed: "0xd6156F8177aA1a6E0c5278CE437A9BDB32F203ef",
                feedType: "dailyYieldPercentage",
                name: "BUIDL-I",
                tokenDecimals: 6,
            },
            {
                token: "0x51C2d74017390CbBd30550179A16A1c28F7210fc",
                priceFeed: "0xEdC6287D3D41b322AF600317628D7E226DD3add4",
                feedType: "price",
                name: "STAC",
                tokenDecimals: 6,
            }
        ],
        morphoVaults: [
            {
                vault: "0xBEEfF0d672ab7F5018dFB614c93981045D4aA98a",
                name: "bbqAUSD",
                vaultDecimals: 18,
                assetDecimals: 6,
            },
        ]
    },
    [CHAIN.AVAX]: {
        start: '2025-07-24',
        address: "0x7107DD8F56642327945294a18A4280C78e153644",
        centrifugeVaults: [
            {
                token: "0x58f93d6b1ef2f44ec379cb975657c132cbed3b6b",
                vault: "0x1121f4e21ed8b9bc1bb9a2952cdd8639ac897784",
                name: "JAAA",
                tokenDecimals: 6,
                assetDecimals: 6
            }
        ]
    },
    [CHAIN.PLUME]: {
        start: '2025-08-22',
        address: "0x1DB91ad50446a671e2231f77e00948E68876F812",
        centrifugeVaults: [
            {
                token: "0x9477724bb54ad5417de8baff29e59df3fb4da74f",
                vault: "0x354a9222571259457b2e98b2285b62e6a9bf4ed3",
                name: "ACRDX",
                tokenDecimals: 18,
                assetDecimals: 6
            }
        ]
    },
    [CHAIN.BASE]: {
        start: '2025-10-29',
        address: "0x9B746dBC5269e1DF6e4193Bcb441C0FbBF1CeCEe",
        morphoVaults: [
            {
                vault: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9",
                name: "steakUSDC",
                vaultDecimals: 18,
                assetDecimals: 6,
            },
        ]
    }
}

async function addCentrifugeYields(options: FetchOptions, dailyFees: Balances) {
    const vaultAddresses = chainConfig[options.chain].centrifugeVaults.map(v => v.vault);
    const tokenDecimals = chainConfig[options.chain].centrifugeVaults.map(v => v.tokenDecimals);
    const assetDecimals = chainConfig[options.chain].centrifugeVaults.map(v => v.assetDecimals);
    const tokenAddresses = chainConfig[options.chain].centrifugeVaults.map(v => v.token);
    const groveWallet = chainConfig[options.chain].address;
    const badDataDays = chainConfig[options.chain].centrifugeVaults.map(v => v.badDataDays);

    const pricePerShareBefore = await options.fromApi.multiCall({
        abi: "uint256:pricePerShare",
        calls: vaultAddresses,
        permitFailure: true,
    })
    const pricePerShareAfter = await options.toApi.multiCall({
        abi: "uint256:pricePerShare",
        calls: vaultAddresses,
        permitFailure: true,
    })

    const tokenBalances = await options.api.multiCall({
        abi: "function balanceOf(address account) view returns (uint256)",
        calls: tokenAddresses.map(token => ({ target: token, params: groveWallet })),
        permitFailure: true,
    })

    for (let i = 0; i < vaultAddresses.length; i++) {
        if (!pricePerShareBefore[i] || !pricePerShareAfter[i] || !tokenDecimals[i] || !assetDecimals[i] || badDataDays[i]?.includes(options.dateString)) {
            continue;
        }
        const priceBefore = pricePerShareBefore[i] / (10 ** assetDecimals[i]);
        const priceAfter = pricePerShareAfter[i] / (10 ** assetDecimals[i]);
        const tokenBalance = tokenBalances[i] / (10 ** tokenDecimals[i]);
        const yieldForPeriod = (priceAfter - priceBefore) * tokenBalance;

        dailyFees.addUSDValue(yieldForPeriod, 'Assets Yields - Centrifuge');
    }
}

async function addAaveHorizonYields(options: FetchOptions, dailyFees: Balances) {
    const aaveTokens = chainConfig[options.chain].aaveHorizonVaults.map(v => v.aToken);
    const groveWallet = chainConfig[options.chain].address;
    const badDataDays = chainConfig[options.chain].aaveHorizonVaults.map(v => v.badDataDays);

    const scaledBalances = await options.api.multiCall({
        abi: "function scaledBalanceOf(address account) view returns (uint256)",
        calls: aaveTokens.map(token => ({ target: token, params: groveWallet })),
        permitFailure: true,
    })

    const previousIndexBefore = await options.fromApi.multiCall({
        abi: "function getPreviousIndex(address) view returns (uint256)",
        calls: aaveTokens.map(token => ({ target: token, params: groveWallet })),
        permitFailure: true,
    })

    const previousIndexAfter = await options.toApi.multiCall({
        abi: "function getPreviousIndex(address) view returns (uint256)",
        calls: aaveTokens.map(token => ({ target: token, params: groveWallet })),
        permitFailure: true,
    })

    for (let i = 0; i < aaveTokens.length; i++) {
        if (!scaledBalances[i] || !previousIndexBefore[i] || !previousIndexAfter[i] || badDataDays[i]?.includes(options.dateString)) {
            continue;
        }
        const scaledBalance = scaledBalances[i] / (10 ** 18);
        const previousIndex = previousIndexBefore[i] / (10 ** 27);
        const currentIndex = previousIndexAfter[i] / (10 ** 27);
        const yieldForPeriod = (currentIndex - previousIndex) * scaledBalance;

        dailyFees.addUSDValue(yieldForPeriod, 'Assets Yields - Aave Horizon');
    }
}

async function addSecuritizeYields(options: FetchOptions, dailyFees: Balances) {
    const groveWallet = chainConfig[options.chain].address;
    const securitizeTokens = chainConfig[options.chain].securitizeVaults.map(v => v.token);
    const priceFeeds = chainConfig[options.chain].securitizeVaults.map(v => v.priceFeed);
    const feedTypes = chainConfig[options.chain].securitizeVaults.map(v => v.feedType);
    const tokenDecimals = chainConfig[options.chain].securitizeVaults.map(v => v.tokenDecimals);

    const tokenBalances = await options.api.multiCall({
        abi: "function balanceOf(address account) view returns (uint256)",
        calls: securitizeTokens.map(token => ({ target: token, params: groveWallet })),
        permitFailure: true,
    })

    const latestAnswerBefore = await options.fromApi.multiCall({
        abi: "function latestAnswer() view returns (int256)",
        calls: priceFeeds,
        permitFailure: true,
    })

    const latestAnswerAfter = await options.toApi.multiCall({
        abi: "function latestAnswer() view returns (int256)",
        calls: priceFeeds,
        permitFailure: true,
    })

    for (let i = 0; i < securitizeTokens.length; i++) {
        if (!tokenBalances[i] || !latestAnswerBefore[i] || !latestAnswerAfter[i]) {
            continue;
        }
        const balance = tokenBalances[i] / (10 ** tokenDecimals[i]);
        const oracleDataAfter = latestAnswerAfter[i] / (10 ** 8);
        const oracleDataBefore = latestAnswerBefore[i] / (10 ** 8);
        let yieldForPeriod = 0;

        if (feedTypes[i] === "dailyYieldPercentage") {
            const ONE_DAY_IN_SECONDS = 86400;
            const yieldPercentageForPeriod = (oracleDataAfter - oracleDataBefore) * (options.toTimestamp - options.fromTimestamp) / ONE_DAY_IN_SECONDS;
            yieldForPeriod = balance * yieldPercentageForPeriod;
        }
        else if (feedTypes[i] === "price") {
            yieldForPeriod = balance * (oracleDataAfter - oracleDataBefore);
        }

        dailyFees.addUSDValue(yieldForPeriod, 'Assets Yields - Securitize');
    }
}

async function addMorphoYields(options: FetchOptions, dailyFees: Balances) {
    const morphoVaults = chainConfig[options.chain].morphoVaults.map(v => v.vault);
    const groveWallet = chainConfig[options.chain].address;
    const vaultDecimals = chainConfig[options.chain].morphoVaults.map(v => v.vaultDecimals);
    const assetDecimals = chainConfig[options.chain].morphoVaults.map(v => v.assetDecimals);

    const tokenBalances = await options.api.multiCall({
        abi: "function balanceOf(address account) view returns (uint256)",
        calls: morphoVaults.map(token => ({ target: token, params: groveWallet })),
        permitFailure: true,
    })

    const convertToAssetsBefore = await options.fromApi.multiCall({
        abi: "function convertToAssets(uint256) view returns (uint256)",
        calls: morphoVaults.map((token, index) => ({ target: token, params: String(10 ** vaultDecimals[index]) })),
        permitFailure: true,
    })

    const convertToAssetsAfter = await options.toApi.multiCall({
        abi: "function convertToAssets(uint256) view returns (uint256)",
        calls: morphoVaults.map((token, index) => ({ target: token, params: String(10 ** vaultDecimals[index]) })),
        permitFailure: true,
    })

    for (let i = 0; i < morphoVaults.length; i++) {
        if (!tokenBalances[i] || !convertToAssetsBefore[i] || !convertToAssetsAfter[i]) {
            continue;
        }
        const tokenBalance = tokenBalances[i] / (10 ** vaultDecimals[i]);
        const convertToAssetsBeforeValue = convertToAssetsBefore[i] / (10 ** assetDecimals[i]);
        const convertToAssetsAfterValue = convertToAssetsAfter[i] / (10 ** assetDecimals[i]);
        const yieldForPeriod = (convertToAssetsAfterValue - convertToAssetsBeforeValue) * tokenBalance;

        dailyFees.addUSDValue(yieldForPeriod, 'Assets Yields - Morpho');
    }

}

async function fetch(_a: any, _b: any, options: FetchOptions) {

    const dailyFees = options.createBalances();

    if (chainConfig[options.chain].centrifugeVaults) {
        await addCentrifugeYields(options, dailyFees);
    }

    if (chainConfig[options.chain].aaveHorizonVaults) {
        await addAaveHorizonYields(options, dailyFees);
    }

    if (chainConfig[options.chain].securitizeVaults) {
        await addSecuritizeYields(options, dailyFees);
    }

    if (chainConfig[options.chain].morphoVaults) {
        await addMorphoYields(options, dailyFees);
    }


    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees,
    }
}

const methodology = {
    Fees: "Includes all the yields earned by allocating assets into various defi protocols",
    Revenue: "No revenue",
    SupplySideRevenue: "All the yields go to investors"
}

const breakdownMethodology = {
    Fees: {
        'Assets Yields - Centrifuge': 'Yields earned by allocating assets into centrifuge vaults',
        'Assets Yields - Aave Horizon': 'Yields earned by allocating assets into aave horizon vaults',
        'Assets Yields - Securitize': 'Yields earned by allocating assets into securitize vaults',
        'Assets Yields - Morpho': 'Yields earned by allocating assets into morpho vaults',
    },
    SupplySideRevenue: {
        'Assets Yields - Centrifuge': 'Yields earned by allocating assets into centrifuge vaults',
        'Assets Yields - Aave Horizon': 'Yields earned by allocating assets into aave horizon vaults',
        'Assets Yields - Securitize': 'Yields earned by allocating assets into securitize vaults',
        'Assets Yields - Morpho': 'Yields earned by allocating assets into morpho vaults',
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
    doublecounted: true,
}

export default adapter;