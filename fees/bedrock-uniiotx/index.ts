import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const DECIMALS = 18;
const MANAGER_FEE_DENOMINATOR = 1000;
const UNI_IOTX = "0x236f8c0a61da474db21b693fb2ea7aab0c803894";
const UNI_IOTX_STAKING = "0x2c914ba874d94090ba0e6f56790bb8eb6d4c7e5f";

const METRICS = {
    IOTX_STAKING_REWARDS: "uniIOTX Staking Rewards",
    PERFORMANCE_FEES: "uniIOTX Performance Fees",
    IOTX_STAKING_REWARDS_TO_HOLDERS: "uniIOTX Staking Rewards To Holders",
};

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [totalSupply, exchangeRatioBefore, exchangeRatioAfter, managerFeeShares] = await Promise.all([options.api.call({
        abi: "uint256:totalSupply",
        target: UNI_IOTX,
    }), options.fromApi.call({
        abi: "uint256:exchangeRatio",
        target: UNI_IOTX_STAKING,
    }), options.toApi.call({
        abi: "uint256:exchangeRatio",
        target: UNI_IOTX_STAKING,
    }), options.fromApi.call({
        abi: "uint256:managerFeeShares",
        target: UNI_IOTX_STAKING,
    })]);

    const exchangeRatioDelta = exchangeRatioAfter - exchangeRatioBefore;

    const supplySideRevenue = totalSupply * (exchangeRatioDelta / (10 ** DECIMALS));

    const protocolRevenue = supplySideRevenue * (managerFeeShares / MANAGER_FEE_DENOMINATOR) / (1 - (managerFeeShares / MANAGER_FEE_DENOMINATOR));
    const grossRewards = supplySideRevenue + protocolRevenue;

    dailyFees.addGasToken(grossRewards, METRICS.IOTX_STAKING_REWARDS);
    dailyRevenue.addGasToken(protocolRevenue, METRICS.PERFORMANCE_FEES);
    dailySupplySideRevenue.addGasToken(supplySideRevenue, METRICS.IOTX_STAKING_REWARDS_TO_HOLDERS);

    return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
    Fees: "Gross uniIOTX staking rewards, calculated from uniIOTX exchangeRatio growth for holders plus the implied Bedrock manager commission.",
    Revenue: "Bedrock manager commission on uniIOTX staking rewards.",
    ProtocolRevenue: "Bedrock manager commission on uniIOTX staking rewards.",
    SupplySideRevenue: "uniIOTX holder staking rewards measured from exchangeRatio growth.",
};

const breakdownMethodology = {
    Fees: {
        [METRICS.IOTX_STAKING_REWARDS]: "Gross uniIOTX staking rewards, calculated from uniIOTX exchangeRatio growth for holders plus the implied Bedrock manager commission.",
    },
    Revenue: {
        [METRICS.PERFORMANCE_FEES]: "Performance fees on uniIOTX staking rewards.",
    },
    ProtocolRevenue: {
        [METRICS.PERFORMANCE_FEES]: "Performance fees on uniIOTX staking rewards.",
    },
    SupplySideRevenue: {
        [METRICS.IOTX_STAKING_REWARDS_TO_HOLDERS]: "uniIOTX holder staking rewards measured from exchangeRatio growth.",
    },
};

const adapter: Adapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.IOTEX],
    start: "2025-09-15",
    methodology,
    breakdownMethodology,
};

export default adapter;
