import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const decimals = 18;
const UNIETH_MANAGER_FEE_DENOMINATOR = 1000;
const UNIETH = "0xF1376bceF0f78459C0Ed0ba5ddce976F1ddF51F4";
const UNIETH_STAKING = "0x4beFa2aA9c305238AA3E0b5D17eB20C045269E9d";

const METRICS = {
    ETH_STAKING_REWARDS: "uniETH Staking Rewards",
    PERFORMANCE_FEES: "uniETH Performance Fees",
    ETH_STAKING_REWARDS_TO_HOLDERS: "uniETH Staking Rewards To Holders",
};

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const [uniEthTotalSupply, uniEthExchangeRatioBefore, uniEthExchangeRatioAfter, managerFeeShare] = await Promise.all([options.api.call({
        target: UNIETH,
        abi: "uint256:totalSupply",
    }), options.fromApi.call({
        target: UNIETH_STAKING,
        abi: "uint256:exchangeRatio"
    }), options.toApi.call({
        target: UNIETH_STAKING,
        abi: "uint256:exchangeRatio"
    }), options.api.call({
        target: UNIETH_STAKING,
        abi: "uint256:managerFeeShare"
    })]);

    const exchangeRatioDelta = uniEthExchangeRatioAfter - uniEthExchangeRatioBefore;

    const supplySideRevenue = uniEthTotalSupply * exchangeRatioDelta / 10 ** decimals;

    const protocolRevenue = supplySideRevenue * (managerFeeShare / UNIETH_MANAGER_FEE_DENOMINATOR) / (1 - (managerFeeShare / UNIETH_MANAGER_FEE_DENOMINATOR));
    const grossRewards = supplySideRevenue + protocolRevenue;

    dailyFees.addGasToken(grossRewards, METRICS.ETH_STAKING_REWARDS);
    dailyRevenue.addGasToken(protocolRevenue, METRICS.PERFORMANCE_FEES);
    dailyProtocolRevenue.addGasToken(protocolRevenue, METRICS.PERFORMANCE_FEES);
    dailySupplySideRevenue.addGasToken(supplySideRevenue, METRICS.ETH_STAKING_REWARDS_TO_HOLDERS);

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailySupplySideRevenue,
    };
}

const methodology = {
    Fees: "Gross uniETH staking rewards, calculated from uniETH exchangeRatio growth for holders plus the implied Bedrock manager commission.",
    Revenue: "Bedrock manager commission on uniETH staking rewards.",
    ProtocolRevenue: "Bedrock manager commission on uniETH staking rewards.",
    SupplySideRevenue: "uniETH holder staking rewards measured from exchangeRatio growth.",
};

const breakdownMethodology = {
    Fees: {
        [METRICS.ETH_STAKING_REWARDS]: "Gross uniETH staking rewards calculated as holder exchangeRatio yield plus the implied Bedrock manager commission.",
    },
    Revenue: {
        [METRICS.PERFORMANCE_FEES]: "10% performance fees on uniETH staking rewards.",
    },
    ProtocolRevenue: {
        [METRICS.PERFORMANCE_FEES]: "10% performance fees on uniETH staking rewards.",
    },
    SupplySideRevenue: {
        [METRICS.ETH_STAKING_REWARDS_TO_HOLDERS]: "uniETH holder staking rewards measured from exchangeRatio growth.",
    },
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.ETHEREUM],
    start: "2022-09-29",
    methodology,
    breakdownMethodology,
};

export default adapter;
