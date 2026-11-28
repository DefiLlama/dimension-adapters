import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { isCoreAsset } from "../helpers/prices";

// AchSwap DEX aggregator executors on Arc Mainnet (chainId 5042).
// Both versions emit the same Executed event once per swap (covering multi-hop, split, and gasless swaps).
const EXECUTORS = [
  "0x1B844738455b8060D12839331b35893526E9d314", // AchRouteExecutor v1 (active 2026-10-01 to 2026-10-20; first swap block 23639205)
  "0xF69036De0e32566CfF7C79c29229D441cdE3e48E", // AchRouteExecutorV2 (active since 2026-10-20)
];

// Emitted once at the end of every swap on AchRouteExecutor / AchRouteExecutorV2.
// On Arc, native USDC (address(0)) has 18 decimals while ERC-20 USDC (0x3600...) has 6 decimals.
// protocolFee (25 bps from 2026-10-01, lowered to 12 bps on 2026-11-23) is taken in tokenOut and sent to AchSwap's treasury Safe.
// partnerFee (0-100 bps, optional for Developer API integrators) is taken in tokenOut and sent to partnerRecipient.
const EXECUTED_EVENT =
  "event Executed(address indexed payer, address indexed recipient, address indexed tokenOut, address tokenIn, uint256 amountIn, uint256 grossOut, uint256 netOut, uint256 protocolFee, address partnerRecipient, uint256 partnerFee, bytes32 routeHash)";

const NATIVE = ADDRESSES.null;
const PROTOCOL_SWAP_FEES = "Protocol Swap Fees";
const PARTNER_FEES = "Partner Fees";

const isNative = (token: string) => token.toLowerCase() === NATIVE;

const addTokenAmount = (balances: ReturnType<FetchOptions["createBalances"]>, token: string, amount: bigint, label?: string) => {
  if (amount <= 0n) return;
  if (isNative(token)) {
    balances.addGasToken(amount, label);
  } else {
    balances.add(token, amount, label);
  }
};

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const logs = await options.getLogs({
    targets: EXECUTORS,
    eventAbi: EXECUTED_EVENT,
  });

  for (const log of logs) {
    const tokenIn = String(log.tokenIn);
    const tokenOut = String(log.tokenOut);
    const amountIn = BigInt(log.amountIn);
    const grossOut = BigInt(log.grossOut);
    const protocolFee = BigInt(log.protocolFee);
    const partnerFee = BigInt(log.partnerFee);

    // Count one side per swap: prefer input when it is native USDC or a core Arc asset, otherwise output.
    if (isNative(tokenIn) || isCoreAsset(options.chain, tokenIn)) {
      addTokenAmount(dailyVolume, tokenIn, amountIn);
    } else if (isNative(tokenOut) || isCoreAsset(options.chain, tokenOut)) {
      addTokenAmount(dailyVolume, tokenOut, grossOut);
    } else {
      addTokenAmount(dailyVolume, tokenIn, amountIn);
    }

    if (protocolFee > 0n) {
      addTokenAmount(dailyFees, tokenOut, protocolFee, PROTOCOL_SWAP_FEES);
      addTokenAmount(dailyRevenue, tokenOut, protocolFee, PROTOCOL_SWAP_FEES);
      addTokenAmount(dailyProtocolRevenue, tokenOut, protocolFee, PROTOCOL_SWAP_FEES);
    }

    if (partnerFee > 0n) {
      addTokenAmount(dailyFees, tokenOut, partnerFee, PARTNER_FEES);
      addTokenAmount(dailySupplySideRevenue, tokenOut, partnerFee, PARTNER_FEES);
    }
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume:
    "Total swap volume routed through AchSwap's on-chain route executors (AchRouteExecutor v1 and AchRouteExecutorV2) on Arc, counted once per swap using the input side (or output side when only the output is native USDC or a core Arc asset). Underlying DEX swaps routed through third-party aggregators are excluded.",
  Fees:
    "Aggregator fees deducted from swap output by AchRouteExecutor v1 and AchRouteExecutorV2: AchSwap's protocol fee (25 bps from 2026-10-01, lowered to 12 bps on 2026-11-23) plus any optional partner integrator fee (0-100 bps). Underlying DEX pool fees are excluded.",
  Revenue:
    "AchSwap's protocol fee retained by the AchSwap treasury Safe (25 bps until 2026-11-23, 12 bps since).",
  ProtocolRevenue:
    "100% of AchSwap's protocol swap fee accrues to the AchSwap protocol treasury.",
  SupplySideRevenue:
    "Optional partner integrator fees (0-100 bps) paid directly to Developer API partner fee recipients on-chain.",
};

const breakdownMethodology = {
  Fees: {
    [PROTOCOL_SWAP_FEES]:
      "Protocol fee deducted from swap output by AchRouteExecutor v1 and AchRouteExecutorV2 (25 bps until 2026-11-23, 12 bps since).",
    [PARTNER_FEES]:
      "Optional integrator fee (0-100 bps) set by Developer API partners and paid out of swap output.",
  },
  Revenue: {
    [PROTOCOL_SWAP_FEES]:
      "Protocol swap fee retained by the AchSwap treasury Safe.",
  },
  ProtocolRevenue: {
    [PROTOCOL_SWAP_FEES]:
      "Protocol swap fee retained by the AchSwap treasury Safe.",
  },
  SupplySideRevenue: {
    [PARTNER_FEES]:
      "Integrator fees paid directly to Developer API partner recipients.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: "2026-10-01",
  methodology,
  breakdownMethodology,
};

export default adapter;
