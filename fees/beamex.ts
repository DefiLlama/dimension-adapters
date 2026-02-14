import { gql, request } from "graphql-request";
import { Adapter, ChainEndpoints, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { METRIC } from "../helpers/metrics";

const endpointsBeamex: ChainEndpoints = {
  [CHAIN.MOONBEAM]:
    'https://graph.beamswap.io/subgraphs/name/beamswap/beamex-stats',
};

const fetch = async (timestamp: number, _a: any, options: FetchOptions) => {
  const { chain, createBalances } = options;
  const searchTimestamp = getTimestampAtStartOfDayUTC(timestamp);

  const graphQuery = gql`{
    feeStat(id: "${searchTimestamp}") {
      mint
      burn
      marginAndLiquidation
      swap
    }
  }`;

  const graphRes = await request(endpointsBeamex[chain], graphQuery);

  const dailyFees = createBalances();
  const dailyUserFees = createBalances();

  // Mint and burn fees based on pool token balance
  const mintFees = parseInt(graphRes.feeStat.mint) / 1e30;
  const burnFees = parseInt(graphRes.feeStat.burn) / 1e30;
  dailyFees.addUSDValue(mintFees, METRIC.MINT_REDEEM_FEES);
  dailyFees.addUSDValue(burnFees, METRIC.MINT_REDEEM_FEES);

  // Margin and liquidation fees (paid by users)
  const marginLiquidationFees = parseInt(graphRes.feeStat.marginAndLiquidation) / 1e30;
  dailyFees.addUSDValue(marginLiquidationFees, METRIC.MARGIN_FEES);
  dailyUserFees.addUSDValue(marginLiquidationFees, METRIC.MARGIN_FEES);

  // Swap fees (paid by users)
  const swapFees = parseInt(graphRes.feeStat.swap) / 1e30;
  dailyFees.addUSDValue(swapFees, METRIC.SWAP_FEES);
  dailyUserFees.addUSDValue(swapFees, METRIC.SWAP_FEES);

  // Revenue splits: 20% to protocol/holders, 60% to BLP stakers
  const dailyRevenue = dailyFees.clone(0.2, METRIC.PROTOCOL_FEES);
  const dailySupplySideRevenue = dailyFees.clone(0.6, 'BLP Staker Fees');

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Fees from open/close position (0.1%), liquidations, swap (0.1% to 0.4%), mint and burn (based on tokens balance in the pool) and borrow fee ((assets borrowed)/(total assets in pool)*0.02%)",
  UserFees:
    "Fees from open/close position (0.1%), swap (0.1% to 0.4%) and borrow fee ((assets borrowed)/(total assets in pool)*0.04%)",
  HoldersRevenue:
    "20% of all collected fees are distributed to $stGLINT stakers",
  SupplySideRevenue:
    "60% of all collected fees are distributed to BLP stakers. Currently they are distributed to treasury",
  Revenue: "20% of all collected fees are distributed to the treasury and upkeep",
  ProtocolRevenue: "20% of all collected fees are distributed to the treasury and upkeep",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: "Fees charged when users mint or burn BLP tokens, calculated based on the token balance in the pool to maintain pool composition",
    [METRIC.MARGIN_FEES]: "Fees from opening/closing perpetual positions (0.1% of position size), liquidation fees, and borrow fees based on pool utilization",
    [METRIC.SWAP_FEES]: "Fees paid by users when swapping tokens (0.1% to 0.4% depending on pool imbalance and swap impact)",
  },
  UserFees: {
    [METRIC.MARGIN_FEES]: "Trading fees paid by users for opening/closing positions and liquidation penalties",
    [METRIC.SWAP_FEES]: "Swap fees paid directly by users when exchanging tokens through the DEX",
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: "20% of all collected fees allocated to the protocol treasury and operational upkeep",
  },
  HoldersRevenue: {
    [METRIC.PROTOCOL_FEES]: "20% of all collected fees distributed to stGLINT token stakers",
  },
  SupplySideRevenue: {
    "BLP Staker Fees": "60% of all collected fees distributed to BLP (Beamex Liquidity Pool) token stakers who provide liquidity to the protocol",
  },
};

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.MOONBEAM]: {
      fetch,
      start: '2023-06-22',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
