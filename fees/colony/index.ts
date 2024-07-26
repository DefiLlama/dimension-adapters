import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResponseValue, ChainBlocks, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

import { stakingRevenue } from "./staking";
import { dexRevenue } from "./dex";

const { request, gql } = require("graphql-request");

const ColonyGovernanceToken = "0xec3492a2508DDf4FDc0cD76F31f340b30d1793e6";
const DexFactoryContract = "0x814ebf333bdaf1d2d364c22a1e2400a812f1f850"
const StakingV3Contract = "0x62685d3EAacE96D6145D35f3B7540d35f482DE5b"

const stakingSubgraphEndpoint = 'https://graph.colonylab.io/subgraphs/name/colony/stakingV3-avalanche-production';
const dexSubgraphEndpoint = 'https://graph.colonylab.io/subgraphs/name/colony-dex/exchange-avalanche-production';

const methodology = {
    HoldersRevenue: "Staking and Unstaking fees are collected by the protocol and distributed back to the stakers.",
    ProtocolRevenue: "Colony DEX distribute swap fees back to liquidity providers."
}

const convertToNumber = async (value: FetchResponseValue): Promise<number> => {
  if (typeof value === 'string') {
    return Number(value);
  }
  if (typeof value === 'number') {
    return value;
  }
  if (value instanceof Balances) {
    return await value.getUSDValue();
  }
  return 0;
};

async function fetch(timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResult> {
  const { createBalances } = options;

  let totalHoldersRevenue = createBalances();
  let dailyHoldersRevenue = createBalances();

  const stakingResult = await stakingRevenue(
    options,
    stakingSubgraphEndpoint,
    ColonyGovernanceToken,
    StakingV3Contract
  );

  const dexResult = await dexRevenue(
    timestamp,
    chainBlocks,
    options.chain,
    dexSubgraphEndpoint,
    DexFactoryContract
  );

  const mergedResult = {
    timestamp: dexResult.timestamp,
    block: dexResult.block,
    totalVolume: dexResult.totalVolume,
    dailyVolume: dexResult.dailyVolume,

    totalFees: await convertToNumber(dexResult.totalFees) + stakingResult.totalFees,
    dailyFees: await convertToNumber(dexResult.dailyFees) + stakingResult.dailyFees,

    totalHoldersRevenue: stakingResult.totalHoldersRevenue,
    dailyHoldersRevenue: stakingResult.dailyHoldersRevenue,
    dailyProtocolRevenue: dexResult["dailyProtocolRevenue"],
    totalProtocolRevenue: dexResult["totalProtocolRevenue"],
  };
  return mergedResult;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch,
      start: 1711370069,
      meta: {
          methodology
      }
    },
  }
}

export default adapter;
