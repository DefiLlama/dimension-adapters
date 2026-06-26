import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://docs.sierra.money
const SIERRA = "0x6E6080e15f8C0010d333D8CAeEaD29292ADb78f7";
const USDC = "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E";

const WAD = BigInt(1e6);

const abis = {
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
    totalSupply: "uint256:totalSupply",
};

async function fetch(options: FetchOptions) {
    const [rateFrom, rateTo] = await Promise.all([
        options.fromApi.call({
            target: SIERRA,
            abi: abis.convertToAssets,
            params: [WAD.toString()],
        }),
        options.toApi.call({
            target: SIERRA,
            abi: abis.convertToAssets,
            params: [WAD.toString()],
        }),
    ]);
    const rateDelta = BigInt(rateTo) - BigInt(rateFrom);

    const dailyFees = options.createBalances();

    const supply = await options.api.call({
        target: SIERRA,
        abi: abis.totalSupply,
    });

    const yieldAmount = (BigInt(supply) * rateDelta) / WAD;

    dailyFees.add(USDC, yieldAmount, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailyRevenue: 0,
        dailySupplySideRevenue: dailyFees,
    };
}

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    allowNegativeValue: true,
    chains: [CHAIN.AVAX],
    start: "2025-09-26",
    methodology: {
        Fees:
            "Total yield distributed to SIERRA holders, measured as total supply × change in exchange rate.",
        Revenue:
            "Sierra Protocol does not currently retain any protocol revenue, all yield passes through to holders.",
        SupplySideRevenue:
            "Total yield distributed to SIERRA holders via exchange rate appreciation.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.ASSETS_YIELDS]:
                "Yield accrued to SIERRA holders from diversified RWA and DeFi reserves, reflected as exchange rate appreciation.",
        },
        SupplySideRevenue: {
            [METRIC.ASSETS_YIELDS]:
                "Yield accrued to SIERRA holders from diversified RWA and DeFi reserves.",
        },
    },
};

export default adapter;
