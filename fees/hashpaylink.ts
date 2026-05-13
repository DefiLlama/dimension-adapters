import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { ethers } from "ethers";

const EVM_TREASURY = "0xcE5dF9e1115F81a2Fc2F65941B20B820d508e753";
const EVM_TREASURY_TOPIC = ethers.zeroPadValue(EVM_TREASURY, 32);
const LABEL = "Hash PayLink Settlement Fees";

const USDC_BY_CHAIN: Record<string, string> = {
  [CHAIN.BASE]: ADDRESSES.base.USDC,
  [CHAIN.ARBITRUM]: ADDRESSES.arbitrum.USDC_CIRCLE,
};

const zeroResult = (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const fetchEVM = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const token = USDC_BY_CHAIN[options.chain];

  try {
    const logs = await options.getLogs({
      target: token,
      eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
      topics: [
        "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef",
        null as any,
        EVM_TREASURY_TOPIC,
      ],
    });

    logs.forEach((log) => dailyFees.add(token, log.value, LABEL));
  } catch (error) {
    console.error(`[hashpaylink:${options.chain}] recoverable fetch failure`, error);
    return zeroResult(options);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  start: "2026-05-01",
  adapter: {
    [CHAIN.BASE]: { fetch: fetchEVM },
    [CHAIN.ARBITRUM]: { fetch: fetchEVM },
  },
  methodology: {
    Fees: "Hash PayLink charges a 0.2% platform fee on successful payment settlement. Sponsored smart-wallet payments may also route a small USDC gas recovery amount to the treasury in the same settlement.",
    UserFees: "Fees are paid by payers as part of the Hash PayLink payment transaction.",
    Revenue: "All tracked fees are collected by the Hash PayLink treasury.",
    ProtocolRevenue: "All tracked fees accrue to the Hash PayLink protocol treasury.",
  },
  breakdownMethodology: {
    Fees: {
      [LABEL]: "USDC transfers received by the Hash PayLink treasury from payment settlement flows.",
    },
    UserFees: {
      [LABEL]: "USDC platform fees and sponsored gas recovery amounts paid by users during settlement.",
    },
    Revenue: {
      [LABEL]: "100% of tracked settlement fees are protocol revenue.",
    },
    ProtocolRevenue: {
      [LABEL]: "100% of tracked settlement fees accrue to the protocol treasury.",
    },
  },
};

export default adapter;
