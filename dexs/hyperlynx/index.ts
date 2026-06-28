import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Hyperlynx — Uniswap V3 + V2 fork DEX on HyperEVM (DefiLlama chain key: hyperliquid)
const V3_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmg87miatabz301usdo94h2v3/subgraphs/uniswap-v3-hyperevm/prod/gn";
const V2_SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmg87miatabz301usdo94h2v3/subgraphs/uniswap-v2-hyperevm/prod/gn";

// Protocol fee, verified on-chain (slot0.feeProtocol = 119 => 1/7 of swap fees on V3).
const V3_PROTOCOL_RATIO = 1 / 7; // ~14.29% of fees to protocol, ~85.71% to LPs
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

  // ---- V3 (subgraph reports feesUSD directly) ----
  const v3 = await request(
    V3_SUBGRAPH,
    gql`query q {
      uniswapDayDatas(where: { date: ${options.startOfDay} }, first: 1000) {
        volumeUSD
        feesUSD
      }
    }`
  );
  v3.uniswapDayDatas.forEach((e: any) => {
    const fees = Number(e.feesUSD);
    dailyVolume.addUSDValue(Number(e.volumeUSD));
    dailyFees.addUSDValue(fees, METRIC.SWAP_FEES);
    dailyRevenue.addUSDValue(fees * V3_PROTOCOL_RATIO, "Protocol fees");
    dailyProtocolRevenue.addUSDValue(fees * V3_PROTOCOL_RATIO, "Protocol fees");
    dailySupplySideRevenue.addUSDValue(fees * (1 - V3_PROTOCOL_RATIO), "LP fees");
  });

  // ---- V2 (old uniswap-v2 schema: dailyVolumeUSD; fee is a flat 0.3%) ----
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
    dailyRevenue.addUSDValue(fees * V2_PROTOCOL_RATIO, "Protocol fees");
    dailyProtocolRevenue.addUSDValue(fees * V2_PROTOCOL_RATIO, "Protocol fees");
    dailySupplySideRevenue.addUSDValue(fees * (1 - V2_PROTOCOL_RATIO), "LP fees");
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
  Fees: "Total swap fees paid by traders across Hyperlynx V3 (0.01% / 0.05% / 0.3% / 1% tiers) and V2 (0.3%) pools.",
  UserFees: "Swap fees paid by traders.",
  Revenue: "Protocol's share of swap fees — ~14.29% (1/7) on V3 and ~16.67% (1/6) on V2.",
  ProtocolRevenue:
    "Protocol fee accrued to Hyperlynx. The planned holder distribution and buy-back (~69%/31% of the protocol fee) is not yet implemented.",
  SupplySideRevenue: "Swap fees paid to liquidity providers (~85.71% on V3, ~83.33% on V2).",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-06-19",
  methodology,
};

export default adapter;
