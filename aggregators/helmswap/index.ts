import ADDRESSES from "../../helpers/coreAssets.json";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// HelmSwap fee router, deployed at the same address on every supported EVM chain:
// - StatelessFeeRouter v1.3 on Base, BNB Chain, Ethereum, Robinhood Chain, Ink, HyperEVM and Elysium.
// - HelmArcFeeRouter v1.3b on Arc (USDC is the gas token, so the router is ERC-20 only). It emits the same
//   SwapWithFee / SurplusShared events, plus ReferrerPayoutRedirected when a referrer payout reverts.
// Verified source: https://sourcify.dev/#/lookup/0x2384EFffE80523aAe945d996257810282D4E25eB
// https://basescan.org/address/0x2384EFffE80523aAe945d996257810282D4E25eB#code
const ROUTER = "0x2384EFffE80523aAe945d996257810282D4E25eB";

// HelmSwap fee treasury (FEE_ACCOUNT, published at https://helmswap.com/api/config as `feeAccount`).
// The router is permissionless: callers pass the treasury in FeeParams, so only fees sent to this
// address are counted as HelmSwap fees. Volume counts every swap routed through the router.
const HELM_TREASURY = "0xf0932924bfefb6405823d27fc1e53af0986ef237";

const SwapWithFeeEvent =
  "event SwapWithFee(address indexed user, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOutNet, uint256 feeAmount, uint16 feeBps, address treasury, address referrer, uint256 referrerShare)";
const SurplusSharedEvent =
  "event SurplusShared(address indexed user, address indexed tokenOut, uint256 quotedOutNet, uint256 surplus, uint256 operatorShare, uint16 surplusShareBps)";
// Arc router only: a reverting referrer payout (e.g. a USDC-blocklisted referrer) is sent to the treasury instead.
const ReferrerPayoutRedirectedEvent =
  "event ReferrerPayoutRedirected(address indexed referrer, address indexed token, uint256 amount)";

const normalize = (token: string) => (token.toLowerCase() === ADDRESSES.GAS_TOKEN_2 ? ADDRESSES.null : token);

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const swaps = await options.getLogs({ target: ROUTER, eventAbi: SwapWithFeeEvent, entireLog: true, parseLog: true });
  const helmTxs = new Set<string>();

  // Referrer shares that were redirected to the treasury (Arc only), keyed by tx hash + token.
  const redirected: Record<string, bigint> = {};
  if (options.chain === CHAIN.ARC) {
    const redirects = await options.getLogs({ target: ROUTER, eventAbi: ReferrerPayoutRedirectedEvent, entireLog: true, parseLog: true });
    for (const log of redirects) {
      const key = `${String(log.transactionHash).toLowerCase()}-${String(log.args.token).toLowerCase()}`;
      redirected[key] = (redirected[key] ?? 0n) + BigInt(log.args.amount);
    }
  }

  for (const log of swaps) {
    const { tokenIn, tokenOut, amountIn, feeAmount, feeBps, treasury, referrer, referrerShare } = log.args;
    // Volume = gross input amount of each swap routed through the router.
    dailyVolume.add(normalize(tokenIn), amountIn);

    if (String(treasury).toLowerCase() !== HELM_TREASURY) continue;
    helmTxs.add(String(log.transactionHash).toLowerCase());

    const fee = BigInt(feeAmount);
    if (fee === 0n) continue;
    // The event does not carry feeFromInput. An input-side fee is exactly floor(amountIn * feeBps / 10000)
    // (StatelessFeeRouter._swapMem); otherwise the fee was taken from the output token.
    const inputSideFee = (BigInt(amountIn) * BigInt(feeBps)) / 10000n;
    const feeToken = normalize(fee === inputSideFee ? tokenIn : tokenOut);
    // referrerShare is in bps of the fee (StatelessFeeRouter._payFee); 0 when there is no referrer.
    let referrerAmount =
      String(referrer).toLowerCase() !== ADDRESSES.null && BigInt(referrerShare) > 0n ? (fee * BigInt(referrerShare)) / 10000n : 0n;
    const redirectKey = `${String(log.transactionHash).toLowerCase()}-${feeToken.toLowerCase()}`;
    if (referrerAmount > 0n && redirected[redirectKey]) {
      const moved = redirected[redirectKey] > referrerAmount ? referrerAmount : redirected[redirectKey];
      redirected[redirectKey] -= moved;
      referrerAmount -= moved;
    }

    dailyFees.add(feeToken, fee, METRIC.SWAP_FEES);
    dailyRevenue.add(feeToken, fee - referrerAmount, "Swap fees to protocol");
    if (referrerAmount > 0n) dailySupplySideRevenue.add(feeToken, referrerAmount, "Swap fees to referrers");
  }

  // Disclosed positive-slippage share: emitted in the same call as SwapWithFee and paid to its treasury.
  const surplus = await options.getLogs({ target: ROUTER, eventAbi: SurplusSharedEvent, entireLog: true, parseLog: true });
  for (const log of surplus) {
    if (!helmTxs.has(String(log.transactionHash).toLowerCase())) continue;
    const { tokenOut, operatorShare } = log.args;
    dailyFees.add(normalize(tokenOut), operatorShare, "Positive slippage share");
    dailyRevenue.add(normalize(tokenOut), operatorShare, "Positive slippage share to protocol");
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross input amount of every SwapWithFee event emitted by the HelmSwap StatelessFeeRouter.",
  Fees: "Disclosed HelmSwap swap fee (feeAmount in SwapWithFee, 0.10% to 1.00% by token tier) plus the disclosed positive-slippage share (SurplusShared), counted only when paid to the HelmSwap treasury.",
  UserFees: "Users pay the disclosed HelmSwap swap fee and positive-slippage share.",
  Revenue: "Fees kept by the HelmSwap treasury after referrer payouts.",
  ProtocolRevenue: "Fees kept by the HelmSwap treasury after referrer payouts.",
  SupplySideRevenue: "Share of the swap fee paid to referrers attached to the swap (on Arc, a referrer payout that reverts is redirected to the treasury and counted as revenue).",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]: "Disclosed HelmSwap swap fee from SwapWithFee events where the treasury is HelmSwap's.",
    "Positive slippage share": "Operator share of positive slippage from SurplusShared events in HelmSwap-treasury swaps.",
  },
  Revenue: {
    "Swap fees to protocol": "Swap fee minus the referrer share.",
    "Positive slippage share to protocol": "Operator share of positive slippage, paid to the HelmSwap treasury.",
  },
  ProtocolRevenue: {
    "Swap fees to protocol": "Swap fee minus the referrer share.",
    "Positive slippage share to protocol": "Operator share of positive slippage, paid to the HelmSwap treasury.",
  },
  SupplySideRevenue: {
    "Swap fees to referrers": "Referrer share of the swap fee (referrerShare bps of feeAmount), excluding shares redirected to the treasury on Arc.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    CHAIN.BASE,
    CHAIN.BSC,
    CHAIN.ETHEREUM,
    CHAIN.ROBINHOOD,
    CHAIN.INK,
    // Deployed 2026-11-20 (UTC): HyperEVM block 51777333, Elysium block 8754212
    // (tx 0x7181f965ccb50e4ffe8bec25e37a77b605f59e87a2a5face164883c95b348bd3), Arc block 32237786.
    [CHAIN.HYPERLIQUID, { start: "2026-11-20" }],
    [CHAIN.ELYSIUM, { start: "2026-11-20" }],
    [CHAIN.ARC, { start: "2026-11-20" }],
  ],
  // Router v1.3 was deployed on 2026-11-19 (UTC) on the first five chains, e.g. Base block 59380078,
  // Ethereum https://etherscan.io/address/0x2384EFffE80523aAe945d996257810282D4E25eB,
  // Ink https://explorer.inkonchain.com/tx/0x68fd4e8413b4a1ec0bcd696d39ec7af6eaca92974762c35ebe1b29997cc0830c
  start: "2026-11-19",
  methodology,
  breakdownMethodology,
};

export default adapter;
