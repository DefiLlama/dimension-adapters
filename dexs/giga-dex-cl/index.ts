import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { breakdownMethodology, buildResult, clFetch } from "../giga-dex";

// GIGA DEX CL: PancakeSwap-v3 style concentrated liquidity pools on Robinhood Chain,
// on-chain logic and fee model shared with dexs/giga-dex
const fetch = async (options: FetchOptions) => buildResult(options, [await clFetch(options)]);

const methodology = {
  Fees: "Swap fees paid by traders on GIGA DEX CL pools, per the pool's fee tier.",
  UserFees: "Traders pay the full swap fee on every trade.",
  Revenue: "Share of swap fees collected by the GIGA fee center for veGIGA stakers, read per pool from slot0.feeProtocol: 100% on gauged pools (pools receiving GIGA emissions), 3% on non-gauged pools.",
  HoldersRevenue: "Share of swap fees distributed to veGIGA stakers (all of the protocol's share).",
  ProtocolRevenue: "The protocol treasury keeps no direct share of swap fees, it earns as a veGIGA staker.",
  SupplySideRevenue: "Share of swap fees kept by liquidity providers: 0% on gauged pools (LPs there earn GIGA emissions instead), 97% on non-gauged pools.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-15',
  methodology,
  breakdownMethodology,
};

export default adapter;
