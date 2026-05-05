import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances } from "@defillama/sdk";

type BedrockBalances = {
  dailyFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailySupplySideRevenue: Balances;
};

const ZERO = 0n;
const ONE = 10n ** 18n;
const UNIETH_MANAGER_FEE_DENOMINATOR = 1000n;
const UNIETH = "0xF1376bceF0f78459C0Ed0ba5ddce976F1ddF51F4";
const UNIETH_STAKING = "0x4beFa2aA9c305238AA3E0b5D17eB20C045269E9d";

const METRICS = {
  ETH_STAKING_REWARDS: "uniETH Staking Rewards",
  ETH_STAKING_REWARDS_TO_PROTOCOL: "uniETH Staking Rewards To Protocol",
  ETH_STAKING_REWARDS_TO_HOLDERS: "uniETH Staking Rewards To Holders",
};

async function fetch(options: FetchOptions) {
  const balances: BedrockBalances = {
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };

  const [totalSupply, exchangeRatioBefore, exchangeRatioAfter, managerFeeShare] = await Promise.all([
    options.fromApi.call({
      target: UNIETH,
      abi: "uint256:totalSupply",
    }),
    options.fromApi.call({
      target: UNIETH_STAKING,
      abi: "uint256:exchangeRatio",
    }),
    options.toApi.call({
      target: UNIETH_STAKING,
      abi: "uint256:exchangeRatio",
    }),
    options.fromApi.call({
      target: UNIETH_STAKING,
      abi: "uint256:managerFeeShare",
    }),
  ]);

  const exchangeRatioDelta = BigInt(exchangeRatioAfter) - BigInt(exchangeRatioBefore);
  const managerShare = BigInt(managerFeeShare);
  if (exchangeRatioDelta <= ZERO || managerShare >= UNIETH_MANAGER_FEE_DENOMINATOR) return balances;

  const supplySideRevenue = BigInt(totalSupply) * exchangeRatioDelta / ONE;
  if (supplySideRevenue <= ZERO) return balances;

  const protocolRevenue = supplySideRevenue * managerShare / (UNIETH_MANAGER_FEE_DENOMINATOR - managerShare);
  const grossRewards = supplySideRevenue + protocolRevenue;

  balances.dailyFees.addGasToken(grossRewards, METRICS.ETH_STAKING_REWARDS);
  balances.dailyRevenue.addGasToken(protocolRevenue, METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL);
  balances.dailyProtocolRevenue.addGasToken(protocolRevenue, METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL);
  balances.dailySupplySideRevenue.addGasToken(supplySideRevenue, METRICS.ETH_STAKING_REWARDS_TO_HOLDERS);

  return balances;
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: {
      start: "2022-09-29",
    },
  },
  methodology: {
    Fees: "Gross uniETH staking rewards, calculated from uniETH exchangeRatio growth for holders plus the implied Bedrock manager commission.",
    Revenue: "Bedrock manager commission on uniETH staking rewards.",
    ProtocolRevenue: "Bedrock manager commission on uniETH staking rewards.",
    SupplySideRevenue: "uniETH holder staking rewards measured from exchangeRatio growth.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.ETH_STAKING_REWARDS]: "Gross uniETH staking rewards calculated as holder exchangeRatio yield plus the implied Bedrock manager commission.",
    },
    Revenue: {
      [METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL]: "Bedrock manager commission inferred from holder yield using managerFeeShare / (1000 - managerFeeShare).",
    },
    ProtocolRevenue: {
      [METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL]: "Bedrock manager commission inferred from holder yield using managerFeeShare / (1000 - managerFeeShare).",
    },
    SupplySideRevenue: {
      [METRICS.ETH_STAKING_REWARDS_TO_HOLDERS]: "uniETH holder staking yield calculated from exchangeRatio growth.",
    },
  },
};

export default adapter;
