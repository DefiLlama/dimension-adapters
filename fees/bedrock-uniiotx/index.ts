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
const MANAGER_FEE_DENOMINATOR = 1000n;
const UNI_IOTX = "0x236f8c0a61da474db21b693fb2ea7aab0c803894";
const UNI_IOTX_STAKING = "0x2c914ba874d94090ba0e6f56790bb8eb6d4c7e5f";

const METRICS = {
  IOTX_STAKING_REWARDS: "uniIOTX Staking Rewards",
  IOTX_STAKING_REWARDS_TO_PROTOCOL: "uniIOTX Staking Rewards To Protocol",
  IOTX_STAKING_REWARDS_TO_HOLDERS: "uniIOTX Staking Rewards To Holders",
};

async function fetch(options: FetchOptions) {
  const balances: BedrockBalances = {
    dailyFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };

  const [totalSupply, exchangeRatioBefore, exchangeRatioAfter, managerFeeShares] = await Promise.all([
    options.fromApi.call({
      target: UNI_IOTX,
      abi: "uint256:totalSupply",
    }),
    options.fromApi.call({
      target: UNI_IOTX_STAKING,
      abi: "uint256:exchangeRatio",
    }),
    options.toApi.call({
      target: UNI_IOTX_STAKING,
      abi: "uint256:exchangeRatio",
    }),
    options.fromApi.call({
      target: UNI_IOTX_STAKING,
      abi: "uint256:managerFeeShares",
    }),
  ]);

  const exchangeRatioDelta = BigInt(exchangeRatioAfter) - BigInt(exchangeRatioBefore);
  const managerFeeShare = BigInt(managerFeeShares);
  if (exchangeRatioDelta <= ZERO || managerFeeShare >= MANAGER_FEE_DENOMINATOR) return balances;

  const supplySideRevenue = BigInt(totalSupply) * exchangeRatioDelta / ONE;
  if (supplySideRevenue <= ZERO) return balances;

  const protocolRevenue = supplySideRevenue * managerFeeShare / (MANAGER_FEE_DENOMINATOR - managerFeeShare);
  const grossRewards = supplySideRevenue + protocolRevenue;

  balances.dailyFees.addGasToken(grossRewards, METRICS.IOTX_STAKING_REWARDS);
  balances.dailyRevenue.addGasToken(protocolRevenue, METRICS.IOTX_STAKING_REWARDS_TO_PROTOCOL);
  balances.dailyProtocolRevenue.addGasToken(protocolRevenue, METRICS.IOTX_STAKING_REWARDS_TO_PROTOCOL);
  balances.dailySupplySideRevenue.addGasToken(supplySideRevenue, METRICS.IOTX_STAKING_REWARDS_TO_HOLDERS);

  return balances;
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.IOTEX]: {
      start: "2025-09-15",
    },
  },
  methodology: {
    Fees: "Gross uniIOTX staking rewards, calculated from uniIOTX exchangeRatio growth for holders plus the implied Bedrock manager commission.",
    Revenue: "Bedrock manager commission on uniIOTX staking rewards.",
    ProtocolRevenue: "Bedrock manager commission on uniIOTX staking rewards.",
    SupplySideRevenue: "uniIOTX holder staking rewards measured from exchangeRatio growth.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.IOTX_STAKING_REWARDS]: "Gross uniIOTX staking rewards calculated as holder exchangeRatio yield plus the implied Bedrock manager commission.",
    },
    Revenue: {
      [METRICS.IOTX_STAKING_REWARDS_TO_PROTOCOL]: "Bedrock manager commission inferred from holder yield using managerFeeShares / (1000 - managerFeeShares).",
    },
    ProtocolRevenue: {
      [METRICS.IOTX_STAKING_REWARDS_TO_PROTOCOL]: "Bedrock manager commission inferred from holder yield using managerFeeShares / (1000 - managerFeeShares).",
    },
    SupplySideRevenue: {
      [METRICS.IOTX_STAKING_REWARDS_TO_HOLDERS]: "uniIOTX holder staking yield calculated from exchangeRatio growth.",
    },
  },
};

export default adapter;
