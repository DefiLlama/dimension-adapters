import * as sdk from "@defillama/sdk";
/// Project URL: https://voodoo.trade
/// Contact: chickenjuju@proton.me
///
/// Voodoo Trade is the ultimate ETH-focused perpetual DEX on Base.
/// Voodoo caters solely to ETH/stable pairs, offering the deepest liquidity and most competitive
/// margin fees available, on par with CEX rates. LPs can earn real yield from both margin trades
/// and swaps on Base's most highly traded pair, with no need to hold any tokens besides ETH
/// and stables. Voodoo is a fair launch platform with support from an array of Base Ecosystem
/// stakeholders, and implements a long-term oriented tokenomics system that is the first of its
/// kind for perpetual DEXs.

import { GraphQLClient, gql } from "graphql-request";
import { Adapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

// Smart contract pads values with 10^30. I.e. 10 USD is stored as 10 * 10^30
const DECIMAL_PLACES = BigInt(10)**BigInt(30);

const graphQLClient = new GraphQLClient(sdk.graph.modifyEndpoint('6eeKiwCJQECCwhE7doeoKCAqSK7VatCsv3piHomYzi6o'));

const GET_FEE_BY_ID = gql`query getFeeById($id: ID!) {
  feeStat(id: $id) {
    id
    marginAndLiquidation
    swap
    mint
    burn
  }
}`;

interface FeeStat {
  marginAndLiquidation: string;
  swap: string;
  mint: string;
  burn: string;
}

interface GetFeeByIdResponse {
  feeStat: FeeStat | null;
}

function sumOfFees(feeStat: FeeStat | null): bigint {
  if (feeStat == null) {
    return BigInt(0);
  }
  const { marginAndLiquidation, swap, mint, burn } = feeStat;
  return BigInt(marginAndLiquidation) + BigInt(swap) + BigInt(mint) + BigInt(burn);
}

const getFetch = () => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const {
    feeStat,
  } = await graphQLClient.request<GetFeeByIdResponse>(GET_FEE_BY_ID, {
    id: `${dayTimestamp}:daily`
  });

  // Hack to retain 2 decimal places. BigInt division doesn't preserve decimal places.
  const dailyFees = Number(sumOfFees(feeStat) / (DECIMAL_PLACES / BigInt(100))) / 100;

  const FEE_DISTRIBUTION_PERCENTAGES = {
    vmxEthLp: 30,
    vlp: 30,
    esVmx: 10,
    team: 20,
    buyAndBurn: 5,
    buyAndAddLiquidity: 5
  }

  const dailySupplySideRevenue = dailyFees * (
    FEE_DISTRIBUTION_PERCENTAGES.vlp
  ) / (100);

  const dailyHoldersRevenue = dailyFees * (
    FEE_DISTRIBUTION_PERCENTAGES.vmxEthLp +
    FEE_DISTRIBUTION_PERCENTAGES.esVmx +
    FEE_DISTRIBUTION_PERCENTAGES.buyAndBurn +
    FEE_DISTRIBUTION_PERCENTAGES.buyAndAddLiquidity
  ) / (100);

  const dailyProtocolRevenue = dailyFees * (
    FEE_DISTRIBUTION_PERCENTAGES.team
  ) / (100);

  const dailyRevenue = dailyHoldersRevenue + dailyProtocolRevenue;

  return {
    timestamp: dayTimestamp,
    dailyFees,
    dailyUserFees: dailyFees,
    dailySupplySideRevenue: dailySupplySideRevenue,
    dailyHoldersRevenue: dailyHoldersRevenue,
    dailyProtocolRevenue: dailyProtocolRevenue,
    dailyRevenue
  };
}

const methodology = {
  Fees: "Fees from open/close position (0.1%), swap (0.18% to 0.8%), mint and burn (based on tokens balance in the pool) and hourly borrow fee ((assets borrowed)/(total assets in pool)*0.0045%)",
  UserFees: "Fees from open/close position (0.1%), swap (0.18% to 0.8%) and borrow fee ((assets borrowed)/(total assets in pool)*0.0045%)",
  HoldersRevenue: "50% of all collected fees goes to the VMX token- 30% to VMX-ETH LP token stakers, 10% to esVMX stakers, 5% to buy and burns and 5% to buyback and liquidity provisioning",
  SupplySideRevenue: "30% of all collected fees goes to VLP holders",
  Revenue: "Revenue is 70% of all collected fees, which goes to VMX stakers",
  ProtocolRevenue: "20% of all collected fees goes to the treasury"
}

const adapter: Adapter = {
  methodology,
  adapter: {
    [CHAIN.BASE]: {
      fetch: getFetch(),
      start: '2023-09-06',
    },
  },
}

export default adapter;
