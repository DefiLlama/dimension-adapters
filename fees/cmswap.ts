/**
 * cmswap / Junoswap.trade — Fees & Revenue on Bitkub Chain.
 *
 * Three fee sources, all accruing 100% to the protocol's feeCollector (no LP split),
 * so Revenue == Fees for this adapter:
 *  - AggRouterJunoswap: `feeBps` skimmed from swap output on every Aggregated event
 *    (feeBps is currently 0 on-chain — the mechanism exists but isn't turned on yet).
 *  - BondingCurveJunoswap: `pumpFee` (currently 100 bps = 1%) skimmed from every buy/sell.
 *    The Swap event's `amountIn` is already net of this fee, so the fee is backed out of it
 *    using the live `pumpFee()` value: fee = amountIn * pumpFee / (10000 - pumpFee).
 *  - BondingCurveJunoswap: a flat `createFee` (currently 0.1 KUB) charged per token creation.
 */
import { ChainApi } from "@defillama/sdk";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

const AGG_ROUTER = "0x869A40921A332e0D79300F91361A3DC77F2a0ebc";
const BONDING_CURVE = "0x65F6EC30A9E70822721585f6Bba15c40c2F8ab4e";

const AGGREGATED_ABI =
  "event Aggregated(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, uint256 fee, uint256 legs, address referrer)";
const SWAP_ABI =
  "event Swap(address indexed sender, bool indexed isBuy, address indexed tokenAddr, uint256 amountIn, uint256 amountOut, uint256 reserveIn, uint256 reserveOut)";
const CREATION_ABI =
  "event Creation(address indexed creator, address tokenAddr, string logo, string description, string link1, string link2, string link3, uint256 createdTime)";

const fetch = async ({ createBalances, getLogs, chain }: FetchOptions) => {
  const dailyFees = createBalances();

  const aggLogs = await getLogs({ target: AGG_ROUTER, eventAbi: AGGREGATED_ABI });
  for (const log of aggLogs) {
    dailyFees.add(log.tokenOut, log.fee, "Aggregator router fee");
  }

  // pumpFee/createFee changes aren't logged on-chain, so there's no historical value to read.
  // We use a fresh *current-state* call (not the framework's block-pinned `api`) because
  // Bitkub Chain's public RPC isn't an archive node and rejects eth_call at old blocks.
  const currentApi = new ChainApi({ chain });
  const [pumpFeeBps, createFeeAmount] = await Promise.all([
    currentApi.call({ target: BONDING_CURVE, abi: "uint256:pumpFee" }),
    currentApi.call({ target: BONDING_CURVE, abi: "uint256:createFee" }),
  ]);
  const pumpFeeBigInt = BigInt(pumpFeeBps);

  if (pumpFeeBigInt > 0n) {
    const swapLogs = await getLogs({ target: BONDING_CURVE, eventAbi: SWAP_ABI });
    for (const log of swapLogs) {
      const feeAmount = (BigInt(log.amountIn) * pumpFeeBigInt) / (10000n - pumpFeeBigInt);
      const feeToken = log.isBuy ? ADDRESSES.null : log.tokenAddr;
      dailyFees.add(feeToken, feeAmount.toString(), "Launchpad trading fee");
    }
  }

  const creationLogs = await getLogs({ target: BONDING_CURVE, eventAbi: CREATION_ABI });
  if (creationLogs.length) {
    const totalCreationFees = BigInt(createFeeAmount) * BigInt(creationLogs.length);
    dailyFees.add(ADDRESSES.null, totalCreationFees.toString(), "Launchpad token-creation fee");
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Aggregator: the router-skim fee (feeBps) deducted from swap output on the Junoswap Aggregator Router. Launchpad: the pump fee (bps) deducted from every bonding-curve buy/sell, plus the flat token-creation fee.",
  Revenue: "All fees accrue entirely to the Junoswap protocol treasury (feeCollector) — there is no LP split — so Revenue equals Fees.",
  "Protocol Revenue": "Same as Revenue: 100% of collected fees go to the protocol treasury.",
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BITKUB]: {
      fetch,
      start: "2026-06-17",
    },
  },
  methodology,
};

export default adapter;
