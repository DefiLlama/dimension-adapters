import ADDRESSES from '../../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// https://docs.sierra.money
// Vault tokens per chain, from https://docs.sierra.money/building-with-sierra/blockchain-addresses
// The SIERRA OFT bridged to Ethereum (0x6bf7788EAA948d9fFBA7E9bb386E2D3c9810e0fc) is left out,
// it is a bridged copy with no exchange rate of its own (convertToAssets reverts).
const config: Record<string, { vaults: string[], usdc: string, start: string }> = {
    [CHAIN.AVAX]: {
        vaults: [
            "0x6E6080e15f8C0010d333D8CAeEaD29292ADb78f7", // SIERRA
        ],
        usdc: ADDRESSES.avax.USDC,
        start: "2025-09-26",
    },
    [CHAIN.ETHEREUM]: {
        vaults: [
            "0xbceb5f6877d979ec621ae694da1102cb95691ad3", // SIERRA
            "0x7706b1a531A7A8cB4c26D24CDc9ae4094a3e0302", // SPLUS, deployed 2026-08-12
        ],
        usdc: ADDRESSES.ethereum.USDC,
        start: "2026-06-23",
    },
};

// Shares are 6 decimals, so converting 1e18 shares keeps the full 18 decimal exchange rate
// precision. Converting 1e6 shares rounds the rate to 6 decimals, which is coarser than
// an hourly change.
const UNIT = BigInt(1e18);

const abis = {
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256)",
    totalSupply: "uint256:totalSupply",
};

async function fetch(options: FetchOptions) {
    const { vaults, usdc } = config[options.chain];
    const calls = vaults.map(target => ({ target, params: [UNIT.toString()] }));
    const [ratesFrom, ratesTo, supplies] = await Promise.all([
        options.fromApi.multiCall({ calls, abi: abis.convertToAssets }),
        options.toApi.multiCall({ calls, abi: abis.convertToAssets }),
        options.api.multiCall({ calls: vaults, abi: abis.totalSupply }),
    ]);

    const dailyFees = options.createBalances();

    vaults.forEach((_, i) => {
        const rateDelta = BigInt(ratesTo[i]) - BigInt(ratesFrom[i]);
        const yieldAmount = (BigInt(supplies[i]) * rateDelta) / UNIT;
        dailyFees.add(usdc, yieldAmount, METRIC.ASSETS_YIELDS);
    });

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
    adapter: Object.fromEntries(
        Object.entries(config).map(([chain, { start }]) => [chain, { start }])
    ),
    methodology: {
        Fees:
            "Total yield distributed to SIERRA and SPLUS holders, measured as total supply × change in exchange rate.",
        Revenue:
            "Sierra Protocol does not currently retain any protocol revenue, all yield passes through to holders.",
        SupplySideRevenue:
            "Total yield distributed to SIERRA and SPLUS holders via exchange rate appreciation.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.ASSETS_YIELDS]:
                "Yield accrued to SIERRA and SPLUS holders from diversified RWA and DeFi reserves, reflected as exchange rate appreciation.",
        },
        SupplySideRevenue: {
            [METRIC.ASSETS_YIELDS]:
                "Yield accrued to SIERRA and SPLUS holders from diversified RWA and DeFi reserves.",
        },
    },
};

export default adapter;
