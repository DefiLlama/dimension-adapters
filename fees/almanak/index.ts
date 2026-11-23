import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";

// Almanak vaults are Lagoon v0.5.0 (ERC-7540) vaults: https://docs.lagoon.finance/vault/fees
// At each settlement the valuation manager's new NAV is applied, then fees are taken by minting vault shares
// to the Almanak fee receiver and to Lagoon's protocol fee receiver (Lagoon's cut is protocolRate(vault) in
// the Lagoon fee registry: 10% since Dec 2025, 0 before). The share price is net of both fees, so the share
// price change is the depositors' yield and the minted shares are the fees.
// Fee rates and both receivers are read at the window's block: alUSD went from 0.1%/1% (management/performance)
// in Jul 2025 to 1%/50% by Nov 2026, and its fee receiver changed in Oct 2025.
const vaults = [
    { address: "0xDCD0f5ab30856F28385F641580Bbd85f88349124", deployedAt: 1749523487 }, // alUSD, initialized 2025-06-10 02:44 UTC
    { address: "0x5a97B0B97197299456Af841F8605543b13b12eE3", deployedAt: 1755667979 }, // alpUSD, initialized 2025-08-20 05:32 UTC
];

const abis = {
    feeRates: "function feeRates() view returns (uint16 managementRate, uint16 performanceRate)",
    getRolesStorage: "function getRolesStorage() view returns (address whitelistManager, address feeReceiver, address safe, address feeRegistry, address valuationManager)",
    protocolFeeReceiver: "address:protocolFeeReceiver",
    convertToAssets: "function convertToAssets(uint256 shares) view returns (uint256 assets)",
    Transfer: "event Transfer(address indexed from, address indexed to, uint256 value)",
    HighWaterMarkUpdated: "event HighWaterMarkUpdated(uint256 oldHighWaterMark, uint256 newHighWaterMark)",
};

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const LAGOON_PROTOCOL_FEES = "Lagoon Protocol Fees";

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    // a vault deployed after the window start has no opening share price to diff against
    const live = vaults.filter(v => v.deployedAt <= options.fromTimestamp).map(v => v.address);

    const assets = await options.api.multiCall({ abi: "address:asset", calls: live });
    const decimals = await options.api.multiCall({ abi: "uint8:decimals", calls: live });
    const feeRates = await options.api.multiCall({ abi: abis.feeRates, calls: live });
    const roles = await options.api.multiCall({ abi: abis.getRolesStorage, calls: live });
    const protocolFeeReceivers = await options.api.multiCall({ abi: abis.protocolFeeReceiver, calls: roles.map((r: any) => r.feeRegistry) });
    const oneShare = live.map((vault, i) => ({ target: vault, params: [(10n ** BigInt(decimals[i])).toString()] }));
    const pricesBefore = await options.fromApi.multiCall({ abi: abis.convertToAssets, calls: oneShare });
    const pricesAfter = await options.toApi.multiCall({ abi: abis.convertToAssets, calls: oneShare });
    const suppliesBefore = await options.fromApi.multiCall({ abi: "uint256:totalSupply", calls: live });
    const transfers = await options.getLogs({ targets: live, eventAbi: abis.Transfer, flatten: false });
    const highWaterMarkUpdates = await options.getLogs({ targets: live, eventAbi: abis.HighWaterMarkUpdated, flatten: false });

    for (let i = 0; i < live.length; i++) {
        const one = 10n ** BigInt(decimals[i]);
        const priceAfter = BigInt(pricesAfter[i]);
        const supplyBefore = BigInt(suppliesBefore[i]);
        const feeReceiver = roles[i].feeReceiver.toLowerCase();
        const protocolFeeReceiver = protocolFeeReceivers[i].toLowerCase();

        // fee shares minted at settlement, valued at the post-settlement share price
        let almanakShares = 0n;
        let lagoonShares = 0n;
        for (const { from, to, value } of transfers[i]) {
            if (from !== ZERO_ADDRESS) continue;
            if (to.toLowerCase() === feeReceiver) almanakShares += BigInt(value);
            else if (to.toLowerCase() === protocolFeeReceiver) lagoonShares += BigInt(value);
        }
        const feeShares = almanakShares + lagoonShares;
        const totalFees = feeShares * priceAfter / one;

        // Lagoon charges performanceRate on the per-share gain above the high-water mark (after the management fee)
        // and then resets the mark to the post-fee share price, so the performance fee in assets is
        // performanceRate / (1 - performanceRate) * shares * (newHWM - oldHWM). The rest of the minted shares is the
        // management fee. The mark is rounded to the asset's decimals, so the split is capped at the minted total.
        const performanceRate = BigInt(feeRates[i].performanceRate); // basis points
        let performanceFees = 0n;
        for (const { oldHighWaterMark, newHighWaterMark } of highWaterMarkUpdates[i]) {
            performanceFees += (BigInt(newHighWaterMark) - BigInt(oldHighWaterMark)) * supplyBefore * performanceRate / ((10000n - performanceRate) * one);
        }
        if (performanceFees > totalFees) performanceFees = totalFees;
        const managementFees = totalFees - performanceFees;

        // share price change on the shares outstanding before settlement = depositors' yield after all fees
        const depositorYield = (priceAfter - BigInt(pricesBefore[i])) * supplyBefore / one;

        dailyFees.add(assets[i], depositorYield + performanceFees, METRIC.ASSETS_YIELDS);
        dailyFees.add(assets[i], managementFees, METRIC.MANAGEMENT_FEES);
        dailySupplySideRevenue.add(assets[i], depositorYield, METRIC.ASSETS_YIELDS);
        if (feeShares > 0n) {
            dailySupplySideRevenue.add(assets[i], totalFees * lagoonShares / feeShares, LAGOON_PROTOCOL_FEES);
            dailyRevenue.add(assets[i], performanceFees * almanakShares / feeShares, METRIC.PERFORMANCE_FEES);
            dailyRevenue.add(assets[i], managementFees * almanakShares / feeShares, METRIC.MANAGEMENT_FEES);
        }
    }

    return {
        dailyFees,
        dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue.clone(),
    };
}

const methodology = {
    Fees: "Total value earned by Almanak vaults at each NAV settlement: the change in depositors' share value plus the management and performance fees taken in vault shares. NAV losses reduce it.",
    Revenue: "Management and performance fees minted to Almanak's fee receiver, after Lagoon's protocol share.",
    ProtocolRevenue: "Management and performance fees minted to Almanak's fee receiver (treasury), after Lagoon's protocol share.",
    SupplySideRevenue: "Yield credited to vault depositors through the share price after all fees, plus Lagoon's protocol share of the fees.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'Vault strategy returns at each NAV settlement, after the management fee and before the performance fee. Negative when the NAV falls or the management fee exceeds the gain.',
        [METRIC.MANAGEMENT_FEES]: 'Annual management fee charged on vault assets, minted as vault shares at settlement.',
    },
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: "Almanak's share of the management fee.",
        [METRIC.PERFORMANCE_FEES]: "Almanak's share of the performance fee, charged on gains above the vault's high-water mark.",
    },
    ProtocolRevenue: {
        [METRIC.MANAGEMENT_FEES]: "Almanak's share of the management fee, sent to the Almanak fee receiver.",
        [METRIC.PERFORMANCE_FEES]: "Almanak's share of the performance fee, sent to the Almanak fee receiver.",
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Yield credited to depositors through the vault share price after all fees. Negative when the NAV falls or the management fee exceeds the gain.',
        [LAGOON_PROTOCOL_FEES]: "Lagoon's protocol share of the management and performance fees, minted to Lagoon's fee receiver.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    // a settlement that posts a lower NAV, or a management fee larger than the gain, lowers the share price:
    // the realized loss is counted in depositor yield and fees
    allowNegativeValue: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-07-10',
    methodology,
    breakdownMethodology
};

export default adapter;
