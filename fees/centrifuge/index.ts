import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const chainConfig = {
    [CHAIN.ETHEREUM]: {
        start: "2025-07-24",
        vaults: [
            {
                token: "0x8c213ee79581ff4984583c6a801e5263418c4b86",
                vault: "0xfe6920eb6c421f1179ca8c8d4170530cdbdfd77a",
                name: "JSTRY",
            },
            {
                token: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
                vault: "0x4880799ee5200fc58da299e965df644fbf46780b",
                name: "JAAA",
                badDataDays: ["2025-07-28"]
            },
        ]
    },
    [CHAIN.AVAX]: {
        start: "2025-07-24",
        vaults: [
            {
                token: "0x58f93d6b1ef2f44ec379cb975657c132cbed3b6b",
                vault: "0x1121f4e21ed8b9bc1bb9a2952cdd8639ac897784",
                name: "JAAA",
            },
        ]
    },
    [CHAIN.PLUME]: {
        start: "2025-09-18",
        vaults: [
            {
                token: "0x9477724bb54ad5417de8baff29e59df3fb4da74f",
                vault: "0x354a9222571259457b2e98b2285b62e6a9bf4ed3",
                name: "ACRDX",
            },
        ]
    },
    [CHAIN.BASE]: {
        start: "2025-08-25",
        vaults: [
            {
                token: "0x5a0f93d040de44e78f251b03c43be9cf317dcf64",
                vault: "0x2aef271f00a9d1b0da8065d396f4e601dbd0ef0b",
                name: "JAAA",
            },
        ]
    },
    [CHAIN.MONAD]: {
        start: "2026-03-27",
        vaults: [
            {
                token: "0xc18e6f730896971a79d748e8dea61067a9bc6040",
                vault: "0x796ba8a2f2d80340ddb6ca8e43e7883812f13cd5",
                name: "JTRSY",
            },
            {
                token: "0xad48f183e586e92a591a610397ebf534609df797",
                vault: "0x926030b9912bd42b092151cfb2396499b967df3a",
                name: "JAAA",
            },
            {
                token: "0x2fabf1c784b8583d63c00c5c9c0377d8cf1a3245",
                vault: "0x082c62088669facc1fa9f056c5efc8cbccda39b2",
                name: "ACRDX",
            },
        ]
    },
    [CHAIN.PHAROS]: {
        start: "2026-03-30",
        vaults: [
            {
                token: "0xc18e6f730896971a79d748e8dea61067a9bc6040",
                vault: "0x160e0dd4c4f693b05eca83bc2ec6fd51954fc434",
                name: "JTRSY",
            },
            {
                token: "0xad48f183e586e92a591a610397ebf534609df797",
                vault: "0x499a9f1ec1d60e6d0d49d3812d326ea659efd6c2",
                name: "JAAA",
            },
        ]
    }
}

const expenseRatio = {
    "JSTRY": 0.25,
    "JTRSY": 0.25,
    "JAAA": 0.5,
    "ACRDX": 0.5,
}

const ONE_YEAR_IN_SECONDS = 365 * 24 * 60 * 60;
const USDC_DECIMALS = 6;

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const badDataDays = chainConfig[options.chain].vaults.map((v: any) => v.badDataDays);

    const tokenAddresses = chainConfig[options.chain].vaults.map((v: any) => v.token);
    const vaultAddresses = chainConfig[options.chain].vaults.map((v: any) => v.vault);
    const tokenNames = chainConfig[options.chain].vaults.map((v: any) => v.name);

    const totalSupplies = await options.api.multiCall({
        abi: "uint256:totalSupply",
        calls: tokenAddresses,
        permitFailure: true,
    })

    const decimals = await options.api.multiCall({
        abi: "uint8:decimals",
        calls: tokenAddresses,
        permitFailure: true,
    })

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

    for (let i = 0; i < tokenAddresses.length; i++) {
        if (!totalSupplies[i] || !pricePerShareBefore[i] || !pricePerShareAfter[i] || !decimals[i] || badDataDays[i]?.includes(options.dateString)) {
            continue;
        }

        const currentExpenseRatio = expenseRatio[tokenNames[i]];
        if (currentExpenseRatio === undefined)
            throw new Error(`Expense ratio not found for token ${tokenNames[i]}`);

        const priceBefore = pricePerShareBefore[i] / (10 ** USDC_DECIMALS);
        const priceAfter = pricePerShareAfter[i] / (10 ** USDC_DECIMALS);
        const tokenDecimals = decimals[i];
        const tokenSupply = totalSupplies[i] / (10 ** tokenDecimals);

        const nav = priceAfter * tokenSupply;

        const expenseRatioForPeriod = currentExpenseRatio * (options.toTimestamp - options.fromTimestamp) / (ONE_YEAR_IN_SECONDS * 100);
        const managementFeesForPeriod = nav * expenseRatioForPeriod;

        dailyFees.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);
        dailyRevenue.addUSDValue(managementFeesForPeriod, METRIC.MANAGEMENT_FEES);

        const pricePerShareChange = priceAfter - priceBefore;
        const yieldForPeriod = pricePerShareChange * tokenSupply;

        dailyFees.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.addUSDValue(yieldForPeriod, METRIC.ASSETS_YIELDS);

    }

    return {
        dailyFees,
        dailyRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}

const methodology = {
    Fees: "Includes management fees and yields from all the vaults",
    Revenue: "Management fees from all the vaults",
    ProtocolRevenue: "All the revenue goes to the protocol",
    SupplySideRevenue: "Yields from all the vaults",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.MANAGEMENT_FEES]: "0.25 to 0.5% annual management fees from all the vaults",
        [METRIC.ASSETS_YIELDS]: "Yields generated by the vaults based on their NAV",
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "Management fees from all the vaults",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "Management fees from all the vaults",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: "Yields generated by the vaults based on their NAV",
    },
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
    allowNegativeValue: true,
}

export default adapter;