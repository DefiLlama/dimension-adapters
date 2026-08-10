import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Hyperlynx V2 — Uniswap V2 fork on HyperEVM (DefiLlama chain key: hyperliquid)
const V2_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmg87miatabz301usdo94h2v3/subgraphs/uniswap-v2-hyperevm/prod/gn";

// V2 has feeTo set => standard Uniswap V2 protocol fee of 1/6 of swap fees.
const V2_PROTOCOL_RATIO = 1 / 6;
// NOTE: the planned split of the protocol fee (~69% to LYNX holders, ~31% buy-back)
// is NOT live yet, so HoldersRevenue is omitted and the full protocol cut is ProtocolRevenue.

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const v2 = await request(
    V2_SUBGRAPH,
    gql`query q {
      uniswapDayDatas(where: { date: ${options.startOfDay} }, first: 1000) {
        dailyVolumeUSD
      }
    }`
  );
  v2.uniswapDayDatas.forEach((e: any) => {
    const vol = Number(e.dailyVolumeUSD);
    const fees = vol * 0.003;
    dailyVolume.addUSDValue(vol);
    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(fees * V2_PROTOCOL_RATIO, "Swap Fees to Protocol");
    dailyProtocolRevenue.addUSDValue(fees * V2_PROTOCOL_RATIO, "Swap Fees to Protocol");
    dailySupplySideRevenue.addUSDValue(fees * (1 - V2_PROTOCOL_RATIO), "Swap Fees to LPs");
  });

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees paid by traders on Hyperlynx V2 pools (0.3%).",
  UserFees: "Swap fees paid by traders.",
  Revenue: "Protocol's share of swap fees — ~16.67% (1/6) on V2.",
  ProtocolRevenue:
    "Protocol fee accrued to Hyperlynx. The planned holder distribution and buy-back (~69%/31% of the protocol fee) is not yet implemented.",
  SupplySideRevenue: "Swap fees paid to liquidity providers (~83.33% on V2).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Swap fees paid by traders on Hyperlynx V2 pools (0.3%).",
  },
  Revenue: {
    "Swap Fees to Protocol": "Protocol's share of swap fees — ~16.67% (1/6) on V2.",
  },
  ProtocolRevenue: {
    "Swap Fees to Protocol": "Protocol's share of swap fees — ~16.67% (1/6) on V2.",
  },
  SupplySideRevenue: {
    "Swap Fees to LPs": "Swap fees paid to liquidity providers (~83.33% on V2).",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-06-19",
  methodology,
  breakdownMethodology,
};

export default adapter;
