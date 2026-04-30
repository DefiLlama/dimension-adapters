import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { Balances, ChainApi } from "@defillama/sdk";
import { Interface } from "ethers";

type ChainConfig = {
  start: string;
  uniBTC?: string;
  redeemRouter?: string;
  uniETHStaking?: string;
};

type BedrockBalances = {
  dailyFees: Balances;
  dailyUserFees: Balances;
  dailyRevenue: Balances;
  dailyProtocolRevenue: Balances;
  dailySupplySideRevenue: Balances;
};

const ZERO = 0n;
const UNIETH_MANAGER_FEE_DENOMINATOR = 1000n;
const UNIETH_REVENUE_ACCOUNTED_EVENT = "event RevenueAccounted(uint256 amount)";
const UNIBTC_DELAYED_REDEEM_CREATED_EVENT = "event DelayedRedeemCreated(address recipient, address token, uint256 amount, uint256 index, uint256 redeemFee)";
const uniETHInterface = new Interface([UNIETH_REVENUE_ACCOUNTED_EVENT]);

const METRICS = {
  ETH_STAKING_REWARDS: "uniETH Staking Rewards",
  ETH_STAKING_REWARDS_TO_PROTOCOL: "uniETH Staking Rewards To Protocol",
  ETH_STAKING_REWARDS_TO_HOLDERS: "uniETH Staking Rewards To Holders",
  UNIBTC_REDEMPTION_FEES: "uniBTC Redemption Fees",
  UNIBTC_REDEMPTION_FEES_TO_PROTOCOL: "uniBTC Redemption Fees To Protocol",
};

const chainConfig: Record<string, ChainConfig> = {
  [CHAIN.ETHEREUM]: {
    start: "2023-07-01",
    uniETHStaking: "0x4beFa2aA9c305238AA3E0b5D17eB20C045269E9d",
    uniBTC: "0x004e9c3ef86bc1ca1f0bb5c7662861ee93350568",
    redeemRouter: "0xAA732c9c110A84d090a72da230eAe1E779f89246",
  },
  [CHAIN.BASE]: {
    start: "2024-10-01",
    uniBTC: "0x93919784C523f39CACaa98Ee0a9d96c3F32b593e",
    redeemRouter: "0xBB45B3a09BFfC15747D1a331775Fa408e587f38d",
  },
  [CHAIN.MERLIN]: {
    start: "2024-04-01",
    uniBTC: "0x93919784C523f39CACaa98Ee0a9d96c3F32b593e",
    redeemRouter: "0xe001Ce855F9e964e5243F0Ff11f2353dC371e810",
  },
  [CHAIN.BITLAYER]: {
    start: "2024-04-01",
    uniBTC: "0x93919784C523f39CACaa98Ee0a9d96c3F32b593e",
    redeemRouter: "0xe001Ce855F9e964e5243F0Ff11f2353dC371e810",
  },
  [CHAIN.ZETA]: {
    start: "2024-04-01",
    uniBTC: "0x6B2a01A5f79dEb4c2f3c0eDa7b01DF456FbD726a",
    redeemRouter: "0xe001Ce855F9e964e5243F0Ff11f2353dC371e810",
  },
};

async function addUniETHFees(options: FetchOptions, config: ChainConfig, balances: BedrockBalances) {
  if (!config.uniETHStaking) return;

  const logs = await options.getLogs({
    target: config.uniETHStaking,
    eventAbi: UNIETH_REVENUE_ACCOUNTED_EVENT,
    entireLog: true,
  });
  const uniqueBlocks = [...new Set(logs.map((log) => Number(log.blockNumber)))];
  const managerFeeShares = await Promise.all(uniqueBlocks.map(async (block) => {
    const blockApi = new ChainApi({ chain: options.chain, block });
    const managerFeeShare = await blockApi.call({
      target: config.uniETHStaking!,
      abi: "uint256:managerFeeShare",
    });
    return [block, BigInt(managerFeeShare)] as const;
  }));
  const managerFeeShareByBlock = new Map(managerFeeShares);

  for (const log of logs) {
    const parsedLog = uniETHInterface.parseLog(log);
    if (!parsedLog) continue;

    const grossRewards = BigInt(parsedLog.args.amount);
    if (grossRewards <= ZERO) continue;

    const managerFeeShare = managerFeeShareByBlock.get(Number(log.blockNumber)) ?? ZERO;
    const protocolRevenue = grossRewards * BigInt(managerFeeShare) / UNIETH_MANAGER_FEE_DENOMINATOR;
    const supplySideRevenue = grossRewards - protocolRevenue;

    balances.dailyFees.addGasToken(grossRewards, METRICS.ETH_STAKING_REWARDS);
    balances.dailyRevenue.addGasToken(protocolRevenue, METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL);
    balances.dailyProtocolRevenue.addGasToken(protocolRevenue, METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL);
    balances.dailySupplySideRevenue.addGasToken(supplySideRevenue, METRICS.ETH_STAKING_REWARDS_TO_HOLDERS);
  }
}

async function addUniBTCRedeemFees(options: FetchOptions, config: ChainConfig, balances: BedrockBalances) {
  if (!config.uniBTC || !config.redeemRouter) return;

  const logs = await options.getLogs({
    target: config.redeemRouter,
    eventAbi: UNIBTC_DELAYED_REDEEM_CREATED_EVENT,
  });

  for (const log of logs) {
    const redeemFee = BigInt(log.redeemFee);
    if (redeemFee <= ZERO) continue;

    balances.dailyFees.add(config.uniBTC, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES);
    balances.dailyUserFees.add(config.uniBTC, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES);
    balances.dailyRevenue.add(config.uniBTC, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL);
    balances.dailyProtocolRevenue.add(config.uniBTC, redeemFee, METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL);
  }
}

async function fetch(options: FetchOptions) {
  const balances: BedrockBalances = {
    dailyFees: options.createBalances(),
    dailyUserFees: options.createBalances(),
    dailyRevenue: options.createBalances(),
    dailyProtocolRevenue: options.createBalances(),
    dailySupplySideRevenue: options.createBalances(),
  };

  const config = chainConfig[options.chain];
  await addUniETHFees(options, config, balances);
  await addUniBTCRedeemFees(options, config, balances);

  return balances;
}

const adapter: Adapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch,
  methodology: {
    Fees: "Gross Bedrock fees include uniETH validator rewards accounted by pushBeacon and uniBTC redemption fees emitted by redeem routers. Token-only uniBTC/brBTC deployments are excluded until Bedrock documents a monetary fee event or split for them.",
    UserFees: "uniBTC redemption fees paid by users when delayed redemption requests are created.",
    Revenue: "Bedrock keeps the uniETH staking commission and all uniBTC redemption fees.",
    ProtocolRevenue: "Bedrock protocol share of uniETH staking rewards plus uniBTC redemption fees.",
    SupplySideRevenue: "uniETH staking rewards passed through to uniETH holders after Bedrock's commission.",
  },
  breakdownMethodology: {
    Fees: {
      [METRICS.ETH_STAKING_REWARDS]: "Gross Ethereum validator rewards emitted as RevenueAccounted by Bedrock's uniETH staking contract.",
      [METRICS.UNIBTC_REDEMPTION_FEES]: "uniBTC redeemFee emitted when delayed redemption requests are created.",
    },
    UserFees: {
      [METRICS.UNIBTC_REDEMPTION_FEES]: "uniBTC redemption fees paid by users when delayed redemption requests are created.",
    },
    Revenue: {
      [METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL]: "Bedrock's on-chain managerFeeShare commission on RevenueAccounted uniETH block rewards, transaction fees, and MEV.",
      [METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL]: "uniBTC redemption fees retained by Bedrock.",
    },
    ProtocolRevenue: {
      [METRICS.ETH_STAKING_REWARDS_TO_PROTOCOL]: "Bedrock's on-chain managerFeeShare commission on RevenueAccounted uniETH block rewards, transaction fees, and MEV.",
      [METRICS.UNIBTC_REDEMPTION_FEES_TO_PROTOCOL]: "uniBTC redemption fees retained by Bedrock.",
    },
    SupplySideRevenue: {
      [METRICS.ETH_STAKING_REWARDS_TO_HOLDERS]: "RevenueAccounted uniETH staking rewards passed through to uniETH holders after Bedrock's on-chain managerFeeShare commission.",
    },
  },
};

export default adapter;
