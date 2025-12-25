import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { nullAddress } from "../../helpers/token";

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
            "0x1329E8DB9Ed7a44726572D44729427F132Fa290D",
            "0x5dcA0B3Ed7594A6613c1A2acd367d56E1f74F92D",
            "0xDcE26B2c78609b983cF91cCcD43E238353653b0E", // IdleCDO_clearpool_DAI
            "0xd0DbcD556cA22d3f3c142e9a3220053FD7a247BC", //Idle DAI
            "0x1f5A97fB665e295303D2F7215bA2160cc5313c8E",
            "0xf6223C567F21E33e859ED7A045773526E9E3c2D5",
        ],
        BEST_YIELD_VAULTS: [
            "0x3fE7940616e5Bc47b0775a0dccf6237893353bB4", //DAI
            "0x5274891bEC421B39D23760c04A6755eCB444797C", //USDC
            "0xF34842d05A1c888Ca02769A633DF37177415C2f8", //USDT
            "0xC8E6CA6E96a326dC448307A5fDE90a0b21fd7f80", //WETH
            "0x5C960a3DCC01BE8a0f49c02A8ceBCAcf5D07fABe", //RAI
            "0xb2d5CB72A621493fe83C6885E4A776279be595bC", //FEI
            "0xc278041fDD8249FE4c1Aad1193876857EEa3D68c", //TUSD
            "0x8C81121B15197fA0eEaEE1DC75533419DcfD3151", //WBTC
            "0xDc7777C771a6e4B3A82830781bDDe4DBC78f320e", //idleUSDCJunior
            "0xfa3AfC9a194BaBD56e743fA3b7aA2CcbED3eAaad", //idleUSDTjunior
        ],
        MAX_YIELD_VAULTS: [
            '0x78751b12da02728f467a44eac40f5cbc16bd7934', // idleDAIYieldV3
            '0x12B98C621E8754Ae70d0fDbBC73D6208bC3e3cA6', // idleUSDCYieldV3
            '0x63D27B3DA94A9E871222CB0A32232674B02D2f2D', // idleUSDTYieldV3
            '0xe79e177d2a5c7085027d7c64c8f271c81430fc9b', // idleSUSDYieldV3
            '0x51C77689A9c2e8cCBEcD4eC9770a1fA5fA83EeF1', // idleTUSDYieldV3
            '0xD6f279B7ccBCD70F8be439d25B9Df93AEb60eC55', // idleWBTCYieldV3
            '0x1846bdfDB6A0f5c473dEc610144513bd071999fB', // idleDAISafeV3
            '0xcDdB1Bceb7a1979C6caa0229820707429dd3Ec6C', // idleUSDCSafeV3
            '0x42740698959761baf1b06baa51efbd88cb1d862b', // idleUSDTSafeV3
        ],
        SAFE_VAULTS: [
            '0x28fAc5334C9f7262b3A3Fe707e250E01053e07b5', // idleUSDTSafe
            '0x3391bc034f2935ef0e1e41619445f998b2680d35', // idleUSDCSafe
            '0xa14ea0e11121e6e951e87c66afe460a00bcd6a16', // idleDAISafe
        ]
    },
    [CHAIN.OPTIMISM]: {
        start: '2023-10-05',
        YIELD_TRANCHES: [
            "0x94e399Af25b676e7783fDcd62854221e67566b7f", // fasanara USDT
            "0x8771128e9E386DC8E4663118BB11EA3DE910e528", //portofino USDT
            "0x67D07aA415c8eC78cbF0074bE12254E55Ad43f3f", //Bastion USDT
            "0xD2c0D848aA5AD1a4C12bE89e713E70B73211989B", //Falconx USDC
        ]
    },
    [CHAIN.POLYGON]: {
        start: '2021-05-31',
        YIELD_TRANCHES: [
            "0xF9E2AE779a7d25cDe46FccC41a27B8A4381d4e52", //Bastion CV
        ],
        BEST_YIELD_VAULTS: [
            "0x8a999F5A3546F8243205b2c0eCb0627cC10003ab", // idleDAIYield
            "0x1ee6470CD75D5686d0b2b90C0305Fa46fb0C89A1", // idleUSDCYield
            "0xfdA25D931258Df948ffecb66b5518299Df6527C4" // idleWETHYield
        ]
    },
    [CHAIN.POLYGON_ZKEVM]: {
        start: "2023-07-20",
        YIELD_TRANCHES: [
            "0x6b8A1e78Ac707F9b0b5eB4f34B02D9af84D2b689", // IdleCDO_clearpool_portofino_USDT
        ]
    },
    [CHAIN.ARBITRUM]: {
        start: "2024-11-29",
        YIELD_TRANCHES: [
            "0x3919396Cd445b03E6Bb62995A7a4CB2AC544245D", //bastion CV
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
    token: "address:token",
}

//In June 2023, the DAO decided to pause the IDLE buyback and distribution to stakers.
const BUYBACK_PAUSE_TIMESTAMP = 1685577600;
const HOLDERS_REVENUE_SHARE = 0.5;

async function fetch(options: FetchOptions): Promise<FetchResult> {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

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
    const totalIsolatedVaults = isolatedVaults.length;
    const combinedVaults = [...seniorVaults, ...juniorVaults];

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

    const vaultDecimals = await options.api.multiCall({
        abi: IDLE_ABIs.decimals,
        calls: combinedVaults.map(vault => vault || nullAddress),
        permitFailure: true,
    });

    const vaultTotalSupply = await options.api.multiCall({
        abi: IDLE_ABIs.totalSupply,
        calls: combinedVaults.map(vault => vault || nullAddress),
        permitFailure: true,
    });

    const performanceFeeInThousandMultiples = await options.api.multiCall({
        abi: IDLE_ABIs.performanceFeeInThousandMultiple,
        calls: isolatedVaults,
        permitFailure: true,
    });

    const seniorVaultDecimals = vaultDecimals.slice(0, totalIsolatedVaults);
    const juniorVaultDecimals = vaultDecimals.slice(totalIsolatedVaults);

    const seniorVaultTotalSupply = vaultTotalSupply.slice(0, totalIsolatedVaults);
    const juniorVaultTotalSupply = vaultTotalSupply.slice(totalIsolatedVaults);

    const calculateAllFees = (underlyingToken: string, totalYields: number, performaceFeesMultiple: number) => {
        dailyFees.add(underlyingToken, totalYields, METRIC.ASSETS_YIELDS);
        dailySupplySideRevenue.add(underlyingToken, totalYields, METRIC.ASSETS_YIELDS);

        dailyFees.add(underlyingToken, totalYields * performaceFeesMultiple, METRIC.PERFORMANCE_FEES);

        if (options.fromTimestamp < BUYBACK_PAUSE_TIMESTAMP) {
            dailyHoldersRevenue.add(underlyingToken, totalYields * performaceFeesMultiple * HOLDERS_REVENUE_SHARE, METRIC.TOKEN_BUY_BACK);
            dailyProtocolRevenue.add(underlyingToken, totalYields * performaceFeesMultiple * (1 - HOLDERS_REVENUE_SHARE), METRIC.PERFORMANCE_FEES);
        }
        else {
            dailyProtocolRevenue.add(underlyingToken, totalYields * performaceFeesMultiple, METRIC.PERFORMANCE_FEES);
        }
        dailyRevenue.add(underlyingToken, totalYields * performaceFeesMultiple, METRIC.PERFORMANCE_FEES);
    }

    for (const [index, _isolatedVault] of isolatedVaults.entries()) {
        const totalSeniorYieldForPeriod = (seniorVaultPricesAfter[index] - seniorVaultPricesBefore[index]) * seniorVaultTotalSupply[index] / (10 ** seniorVaultDecimals[index]);
        const totalJuniorYieldForPeriod = (juniorVaultPricesAfter[index] - juniorVaultPricesBefore[index]) * juniorVaultTotalSupply[index] / (10 ** juniorVaultDecimals[index]);

        if (totalSeniorYieldForPeriod > 0) {
            const performaceFeesMultiple = performanceFeeInThousandMultiples[index] / (1000 * 100);
            calculateAllFees(underlyingTokens[index], totalSeniorYieldForPeriod, performaceFeesMultiple);
        }

        if (totalJuniorYieldForPeriod > 0) {
            const performanceFeesMultiple = performanceFeeInThousandMultiples[index] / (1000 * 100);
            calculateAllFees(underlyingTokens[index], totalJuniorYieldForPeriod, performanceFeesMultiple);
        }
    }

    const bestYieldVaults = chainConfig[options.chain].BEST_YIELD_VAULTS;
    const maxYieldVaults = chainConfig[options.chain].MAX_YIELD_VAULTS;
    const safeVaults = chainConfig[options.chain].SAFE_VAULTS;

    const remainingVaults = [
        ...(bestYieldVaults ?? []),
        ...(maxYieldVaults ?? []),
        ...(safeVaults ?? []),
    ];

    if (remainingVaults.length > 0) {
            const totalSupplies = await options.api.multiCall({
                calls: remainingVaults,
                abi: IDLE_ABIs.totalSupply,
                permitFailure: true,
            });

            const pricesBefore = await options.fromApi.multiCall({
                calls: remainingVaults,
                abi: IDLE_ABIs.tokenPrice,
                permitFailure: true,
            });

            const pricesAfter = await options.toApi.multiCall({
                calls: remainingVaults,
                abi: IDLE_ABIs.tokenPrice,
                permitFailure: true,
            });

            const underlyingTokens = await options.api.multiCall({
                calls: remainingVaults,
                abi: IDLE_ABIs.token,
                permitFailure: true,
            });

            const performanceFeeInThousandBpsMultiple = await options.api.multiCall({
                calls: remainingVaults,
                abi: IDLE_ABIs.performanceFeeInThousandMultiple,
                permitFailure: true,
            });

            for (const [index, _vault] of remainingVaults.entries()) {

                const totalYieldForPeriod = (pricesAfter[index] - pricesBefore[index]) * (totalSupplies[index]) / (10 ** 18);

                if (totalYieldForPeriod > 0) {
                    const performaceFeesMultiple = performanceFeeInThousandBpsMultiple[index] / (1000 * 100);
                    calculateAllFees(underlyingTokens[index], totalYieldForPeriod, performaceFeesMultiple);
                }
            }
    }
    return {
        dailyFees,
        dailyRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
        dailyProtocolRevenue,
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
        [METRIC.PERFORMANCE_FEES]: '50% of the performance fees before Jun 2023 and 100% of the performance fees post'
    },
    SupplySideRevenue: {
        [METRIC.ASSETS_YIELDS]: 'Increase in vault prices'
    },
    ProtocolRevenue: {
        [METRIC.PERFORMANCE_FEES]: '50% of the performance fees before Jun 2023 and 100% of the performance fees post'
    },
    HoldersRevenue: {
        [METRIC.TOKEN_BUY_BACK]: '50% of the performance fees distributed through buyback to IDLE stakers before Jun 2023'
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