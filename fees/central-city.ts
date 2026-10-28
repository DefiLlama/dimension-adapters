import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { METRIC } from "../helpers/metrics";

// Central City (https://centralcity.ai): AI agents on Base pay for services in USDC (x402). Qualifying
// Feed service payments carry a 10% protocol fee, charged by the CentralCityFeeRouter and sent straight
// to the Central City treasury. Methodology: https://centralcity.ai/docs/protocol-fees.md

// CentralCityFeeRouter on Base: immutable and ownerless; it settles Base USDC only, computes the fee as
// 10% of the service price (rounded down) and sends it straight to the treasury fixed at deployment
// (treasury() = 0xAF36084a4dc0CE760A6dCfa46Cf129e140c92aa9). Deployed at block 52603696 (2026-10-14);
// first fee at block 52629946 (2026-10-15). Verified source:
// https://basescan.org/address/0xA5f89AE25c87C21a8E2B03aaBf398A880d9be81B#code
const FEE_ROUTER = "0xA5f89AE25c87C21a8E2B03aaBf398A880d9be81B";
// CentralCityFeeRouter2 on Base: the same contract (same fee, treasury, token and FeeCharged event) with a
// 100 USDC cap instead of 0.10 USDC; Central City sends payments above 0.10 USDC through it.
// Deployed at block 52767258 (2026-10-18). Verified source: https://basescan.org/address/0xb1945a2af160e84e34f7c0fb0e4dd94fd4c0af0d#code
const FEE_ROUTER_2 = "0xb1945a2af160e84e34f7c0fb0e4dd94fd4c0af0d";
// CentralCityFeeRouter3 on Base: the same fee, treasury, token and FeeCharged event (kind 1, fee included),
// settled with two USDC transferWithAuthorization legs (seller share and fee) signed by the payer, so each
// payment is also a standard x402-style USDC transfer. 100 USDC cap. Deployed at block 52804453
// (2026-10-19). Verified source: https://basescan.org/address/0xe807a76385ec3d76d17ab955091c12329d0a1403#code
const FEE_ROUTER_3 = "0xe807a76385ec3d76d17ab955091c12329d0a1403";
const FEE_ROUTERS = [FEE_ROUTER, FEE_ROUTER_2, FEE_ROUTER_3];
const USDC = ADDRESSES.base.USDC;

// One event per collected fee, emitted in the call that moves the fee to the treasury: gross = the
// service price, fee = the protocol fee in USDC units. Fees and revenue are this exact on-chain value.
const FEE_CHARGED_EVENT =
  "event FeeCharged(address indexed payer, address indexed payee, bytes32 indexed ref, uint8 kind, uint256 gross, uint256 fee)";

// Revenue label (source + destination): the whole fee goes to the treasury.
const SERVICE_FEES_TO_TREASURY = "Service Fees To Treasury";

// Volume counts only fee-included payments (kind 1, pay()): the router itself moves the full price
// (seller share and fee), so the event's gross is exactly what moved. Fee-on-top payments (kind 0)
// are left out: there the router moves only the fee, and the price is a separate x402 settlement
// that DefiLlama's x402 listing (dexs/x402) can count.
const KIND_INCLUDED = 1;

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyVolume = options.createBalances();

  const logs = await options.getLogs({ targets: FEE_ROUTERS, eventAbi: FEE_CHARGED_EVENT });
  for (const log of logs) {
    dailyFees.add(USDC, log.fee, METRIC.SERVICE_FEES);
    dailyRevenue.add(USDC, log.fee, SERVICE_FEES_TO_TREASURY);
    if (Number(log.kind) === KIND_INCLUDED) dailyVolume.add(USDC, log.gross);
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const methodology = {
  Volume: "Service payments in USDC on Base settled through Central City's immutable fee routers with the fee included: the full price the router moves for each payment (90% to the seller, 10% fee to the treasury). Fee-on-top payments, where the router moves only the fee, are not counted. Includes payments made by all agents created on Central City, counted under the same rules.",
  Fees: "The 10% protocol fee on qualifying Feed service payments, which AI agents make in USDC on Base for services on Central City's Feed (other payments carry no fee), charged by Central City's immutable fee routers and sent straight to the Central City treasury. Includes payments made by all agents created on Central City, counted under the same rules.",
  Revenue: "The full 10% protocol fee on qualifying Feed service payments, which AI agents make in USDC on Base for services on Central City's Feed, kept by Central City: the immutable fee routers send it straight to the Central City treasury. Includes payments made by all agents created on Central City, counted under the same rules.",
  ProtocolRevenue: "The full 10% protocol fee on qualifying Feed service payments, which AI agents make in USDC on Base for services on Central City's Feed, sent by Central City's immutable fee routers straight to the Central City treasury. Includes payments made by all agents created on Central City, counted under the same rules.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SERVICE_FEES]:
      "The 10% protocol fee on qualifying Feed service payments in USDC on Base, charged by Central City's immutable fee routers and sent straight to the Central City treasury. Includes payments made by all agents created on Central City, counted under the same rules.",
  },
  Revenue: {
    [SERVICE_FEES_TO_TREASURY]:
      "The full 10% protocol fee on qualifying Feed service payments in USDC on Base, sent by Central City's immutable fee routers straight to the Central City treasury. Includes payments made by all agents created on Central City, counted under the same rules.",
  },
  ProtocolRevenue: {
    [SERVICE_FEES_TO_TREASURY]:
      "The full 10% protocol fee on qualifying Feed service payments in USDC on Base, sent by Central City's immutable fee routers straight to the Central City treasury. Includes payments made by all agents created on Central City, counted under the same rules.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2026-10-14",
  methodology,
  breakdownMethodology,
};

export default adapter;
