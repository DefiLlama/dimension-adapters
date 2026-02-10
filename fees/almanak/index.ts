import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { getERC4626VaultsYield } from "../../helpers/erc4626";
import { METRIC } from "../../helpers/metrics";

const feeRateAbi = "function feeRates() external view returns(tuple(uint16 managementRate, uint16 performanceRate))";

const vaults = [
    "0xDCD0f5ab30856F28385F641580Bbd85f88349124", // alUSD
    "0x5a97B0B97197299456Af841F8605543b13b12eE3", // alpUSD
];

const ONE_YEAR = 365 * 24 * 60 * 60;

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
    let dailyFees = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const feeDetails = await options.api.multiCall({
        abi: feeRateAbi,
        calls: vaults,
    });

    const asset = await options.api.multiCall({
        abi: 'address:asset',
        calls: vaults,
    });

    const totalAssets = await options.api.multiCall({
        abi: 'uint256:totalAssets',
        calls: vaults,
    });

    for (let i = 0; i < vaults.length; i++) {
        const { performanceRate, managementRate } = feeDetails[i]; //fee in BPs
        const dailyYield = await getERC4626VaultsYield({ options, vaults: [vaults[i]] });
        const dailyManagementFee = (totalAssets[i]) * (managementRate / 100) * ((options.toTimestamp - options.fromTimestamp) / ONE_YEAR)
        dailySupplySideRevenue.add(dailyYield, METRIC.ASSETS_YIELDS);
        dailyFees = dailySupplySideRevenue.clone(1 / (1 - performanceRate / 10000));
        dailyFees.add(asset[i], dailyManagementFee, METRIC.MANAGEMENT_FEES);
    }

    const dailyRevenue = dailyFees.clone();
    dailyRevenue.subtract(dailySupplySideRevenue, METRIC.ASSETS_YIELDS);

    return {
        dailyFees,
        dailySupplySideRevenue: dailySupplySideRevenue,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue
    }
}

const methodology = {
    Fees: "Includes yields earned by almanak vaults, performance fee and management fee",
    Revenue: "Performance fee and management fees",
    ProtocolRevenue: "All the revenue goes to protocol treasury",
    SupplySideRevenue: "Yields earned by almanak vault depositors post fee",
};

const breakdownMethodology = {
    Revenue: {
        [METRIC.MANAGEMENT_FEES]: 'Annual management fees (usually 0.1%)',
        [METRIC.PERFORMANCE_FEES]: 'Performance fees on yield (usually 10%)'
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Yields earned by almanak vaults',
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: '2025-07-10',
    methodology,
    breakdownMethodology
};

export default adapter;