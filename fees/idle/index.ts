import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import ADDRESSES from '../../helpers/coreAssets.json'

const chainConfig: Record<string, Record<string, any>> = {
    [CHAIN.ETHEREUM]: {
        start: '2020-08-04',
        YIELD_TRANCHES: [
            "0x34dCd573C5dE4672C8248cd12A99f875Ca112Ad8", //lido stEth
            "0x87E53bE99975DA318056af5c4933469a6B513768", //steakhouse usdc
            "0x8E0A8A5c1e5B3ac0670Ea5a613bB15724D51Fc37", //instadapp stEth
            "0xF87ec7e1Ee467d7d78862089B92dd40497cBa5B8", //lido matic
            "0x1EB1b47D0d8BCD9D761f52D26FCD90bBa225344C", //ethena usde
            "0xbc48967C34d129a2ef25DD4dc693Cc7364d02eb9", //gearbox WETH
            "0xdd4D030A4337CE492B55bc5169F6A9568242C0Bc", //gearbox USDC
            "0x7c31fDCa14368E0DA2DA7E518687012287bB90B1", //usual USD0++
            "0xDBCEE5AE2E9DAf0F5d93473e08780C9f45DfEb93", //wintermute USDC
            "0xc4574C60a455655864aB80fa7638561A756C5E61", //Fasanara USDT
        ]
    },
    [CHAIN.OPTIMISM]: {
        start: '2023-10-05',
        YIELD_TRANCHES: [
            "0x94e399Af25b676e7783fDcd62854221e67566b7f", // fasanara USDT
            "0x8771128e9E386DC8E4663118BB11EA3DE910e528", //portofino USDT
            "0x67D07aA415c8eC78cbF0074bE12254E55Ad43f3f", //Bastion USDT
        ]
    }
}

const IDLE_ABIs = {
    seniorVault: "address:AATranche",
    juniorVault: "address:BBTranche",
    underlyingToken: "address:token",
    totalSupply: "uint256:totalSupply",
    seniorVaultPrice: "uint256:priceAA",
    juniorVaultPrice: "uint256:priceBB",
    performanceFeeInThousandMultiple: "uint256:fee",
    decimals: "uint8:decimals",
    tokenPrice: "uint256:tokenPrice",
}

const BUYBACK_PAUSE_TIMESTAMP = 1685577600;
const HOLDERS_REVENUE_SHARE = 0.5;

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const isolatedVaults = chainConfig[options.chain].YIELD_TRANCHES;

    const seniorVaults = await options.api.multiCall({
        abi: IDLE_ABIs.seniorVault,
        calls: isolatedVaults,
        permitFailure: true
    });

    const juniorVaults = await options.api.multiCall({
        abi: IDLE_ABIs.juniorVault,
        calls: isolatedVaults,
        permitFailure: true
    });

    const underlyingTokens = await options.api.multiCall({
        abi: IDLE_ABIs.underlyingToken,
        calls: isolatedVaults,
        permitFailure: true
    });

    const seniorVaultPricesBefore = await options.fromApi.multiCall({
        abi: IDLE_ABIs.seniorVaultPrice,
        calls: isolatedVaults,
        permitFailure: true
    });

    const juniorVaultPricesBefore = await options.fromApi.multiCall({
        abi: IDLE_ABIs.juniorVaultPrice,
        calls: isolatedVaults,
        permitFailure: true
    });

    const seniorVaultPricesAfter = await options.toApi.multiCall({
        abi: IDLE_ABIs.seniorVaultPrice,
        calls: isolatedVaults,
        permitFailure: true
    });

    const juniorVaultPricesAfter = await options.toApi.multiCall({
        abi: IDLE_ABIs.juniorVaultPrice,
        calls: isolatedVaults,
        permitFailure: true
    });

    const seniorVaultDecimals = await options.api.multiCall({
        abi: IDLE_ABIs.decimals,
        calls: seniorVaults,
        permitFailure: true,
    });

    const juniorVaultDecimals = await options.api.multiCall({
        abi: IDLE_ABIs.decimals,
        calls: juniorVaults,
        permitFailure: true,
    });

    const seniorVaultTotalSupply = await options.api.multiCall({
        abi: IDLE_ABIs.totalSupply,
        calls: seniorVaults,
        permitFailure: true,
    });

    const juniorVaultTotalSupply = await options.api.multiCall({
        abi: IDLE_ABIs.totalSupply,
        calls: juniorVaults,
        permitFailure: true,
    });

    const performanceFeeInThousandMultiples = await options.api.multiCall({
        abi: IDLE_ABIs.performanceFeeInThousandMultiple,
        calls: isolatedVaults,
        permitFailure: true,
    });

    const calculateAllFees = (underlyingToken: string, totalYields: number, performaceFeesMultiple: number) => {
        dailyFees.add(underlyingToken, totalYields, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(underlyingToken, totalYields, METRIC.ASSETS_YIELDS);

        dailyFees.add(underlyingToken, totalYields * performaceFeesMultiple, METRIC.PERFORMANCE_FEES);

        if (options.fromTimestamp < BUYBACK_PAUSE_TIMESTAMP) {
            dailyHoldersRevenue.add(underlyingToken, totalYields * performaceFeesMultiple * HOLDERS_REVENUE_SHARE, METRIC.PERFORMANCE_FEES);
            dailyRevenue.add(underlyingToken, totalYields * performaceFeesMultiple * (1 - HOLDERS_REVENUE_SHARE), METRIC.PERFORMANCE_FEES);
        }
        else {
            dailyRevenue.add(underlyingToken, totalYields * performaceFeesMultiple, METRIC.PERFORMANCE_FEES);
        }
    }

    for (const [index, _isolatedVault] of isolatedVaults.entries()) {
        const totalSeniorYieldForPeriod = (seniorVaultPricesAfter[index] - seniorVaultPricesBefore[index]) * seniorVaultTotalSupply[index] / (10 ** seniorVaultDecimals[index]);
        const totalJuniorYieldForPeriod = (juniorVaultPricesAfter[index] - juniorVaultPricesBefore[index]) * juniorVaultTotalSupply[index] / (10 ** juniorVaultDecimals[index]);

        if (totalSeniorYieldForPeriod > 0) {
            const performaceFeesMultiple = performanceFeeInThousandMultiples[index] / (1000 * 100);
            calculateAllFees(underlyingTokens[index], totalSeniorYieldForPeriod, performaceFeesMultiple);
        }

        if (totalJuniorYieldForPeriod > 0) {
            const performanceFeesMultiple = (totalJuniorYieldForPeriod * performanceFeeInThousandMultiples[index]) / (1000 * 100);
            calculateAllFees(underlyingTokens[index], totalJuniorYieldForPeriod, performanceFeesMultiple);
        }
    }

    if (options.chain === CHAIN.ETHEREUM) {
        const BEST_YIELD_VAULTS = [
            "0x3fE7940616e5Bc47b0775a0dccf6237893353bB4", //DAI
            "0x5274891bEC421B39D23760c04A6755eCB444797C", //USDC
            "0xF34842d05A1c888Ca02769A633DF37177415C2f8", //USDT
        ];

        const totalSupplies = await options.api.multiCall({
            calls: BEST_YIELD_VAULTS,
            abi: IDLE_ABIs.totalSupply,
            permitFailure: true,
        });

        const pricesBefore = await options.fromApi.multiCall({
            calls: BEST_YIELD_VAULTS,
            abi: IDLE_ABIs.tokenPrice,
            permitFailure: true,
        });

        const pricesAfter = await options.toApi.multiCall({
            calls: BEST_YIELD_VAULTS,
            abi: IDLE_ABIs.tokenPrice,
            permitFailure: true,
        });

        for (const [index, _vault] of BEST_YIELD_VAULTS.entries()) {

            const totalYieldForPeriod = (pricesAfter[index] - pricesBefore[index]) * (totalSupplies[index]) / (10 ** 18);

            if (totalYieldForPeriod > 0) {
                const performaceFeesMultiple = 0.1;
                calculateAllFees(ADDRESSES.ethereum.USDC, totalYieldForPeriod, performaceFeesMultiple);
            }
        }
    }

    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue: dailyRevenue,
    }
}

const methodology = {
    Fees: "Includes Vault yields and performance fees",
    Revenue: "Includes performance fees paid on yields",
    SupplySideRevenue: "Vault yields recived by vault token holders",
    ProtocolRevenue: "All the revenue goes to protocol",
    HoldersRevenue: "50% of the performance fees shared to IDLE token stakers through buybacks before Jun 2023",
}

const breakdownMethodology = {
    Fees: {
        [METRIC.ASSETS_YIELDS]: 'Increase in vault prices',
        [METRIC.PERFORMANCE_FEES]: '10-15% performance fees charged based on vault performance',
    },
    Revenue: {
        [METRIC.PERFORMANCE_FEES]:'50% of the performance fees before Jun 2023 and 100% of the performance fees post'
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Increase in vault prices'
    },
    ProtocolRevenue: {
        [METRIC.PERFORMANCE_FEES]: '50% of the performance fees before Jun 2023 and 100% of the performance fees post'
    },
    HoldersRevenue: {
        [METRIC.PERFORMANCE_FEES]: '50% of the performance fees distributed through buyback to IDLE stakers before Jun 2023'
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    fetch,
    adapter: chainConfig,
    methodology,
    breakdownMethodology,
}

export default adapter;