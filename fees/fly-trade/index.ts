import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// fly.trade migrated to a new DexAggregator router on 2026-05-03.
const MIGRATION_TS = 1777766400; // 2026-05-03
const LEGACY_FEE_COLLECTOR = "0xd39B2A01D4dca42F32Ff52244a1b28811e40045F";

// DexAggregator router addresses. Source: https://docs.fly.trade/developers/deployments
const ROUTER_A = "0x20f6ee51340adeed01a59b0e65cb3703f3dc860c"; // default deployment (most chains)
const ROUTER_B = "0xf5f3b8faf45023fd92c0c88fedf73fb0529fc1cd"; // polygon_zkevm, taiko, telos
const ROUTER_C = "0xc5b20203b6807e742853c96ce7dcfb1e7b201c0a"; // zksync era
const ROUTER_D = "0xf702814d2e1290f3d5f3202565df46272e1b1b92"; // metis, fantom, pharos


const FLY_FEE_RECEIVERS = new Set(
  [
    ROUTER_A,
    ROUTER_B,
    ROUTER_C,
    ROUTER_D,
    LEGACY_FEE_COLLECTOR,
  ].map((a) => a.toLowerCase())
);

const chainConfig: Record<string, { router: string; start: string }> = {
  [CHAIN.ETHEREUM]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.ARBITRUM]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.OPTIMISM]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.BASE]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.BSC]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.POLYGON]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.AVAX]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.SCROLL]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.MANTA]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.LINEA]: { router: ROUTER_A, start: "2025-08-18" },
  [CHAIN.METIS]: { router: ROUTER_D, start: "2025-08-18" },
  [CHAIN.FANTOM]: { router: ROUTER_D, start: "2025-08-18" },
  [CHAIN.BERACHAIN]: { router: ROUTER_A, start: "2025-08-20" },
  [CHAIN.TAIKO]: { router: ROUTER_B, start: "2025-08-20" },
  [CHAIN.INK]: { router: ROUTER_A, start: "2025-11-01" },
  [CHAIN.BLAST]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.SONIC]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.UNICHAIN]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.ABSTRACT]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.HYPERLIQUID]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.KATANA]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.MONAD]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.PLASMA]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.MEGAETH]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.MORPH]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.STABLE]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.OG]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.TEMPO]: { router: ROUTER_A, start: "2026-05-03" },
  [CHAIN.POLYGON_ZKEVM]: { router: ROUTER_B, start: "2026-05-03" },
  [CHAIN.TELOS]: { router: ROUTER_B, start: "2026-05-03" },
  [CHAIN.ERA]: { router: ROUTER_C, start: "2026-05-03" },
  [CHAIN.PHAROS]: { router: ROUTER_D, start: "2026-05-03" },
};

const swapEvent =
  "event Swap(address fromAddress, address toAddress, address fromAssetAddress, address toAssetAddress, uint256 amountIn, uint256 amountOut, uint256 expectedAmountOut, uint256 amountInSurplus, uint256 amountOutSurplus, bytes32 consumerId, address[] swapFeeAssetAddresses, address[] swapFeeReceivers, uint256[] swapFeeAmounts)";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const { router } = chainConfig[options.chain];

  if (options.startTimestamp < MIGRATION_TS) {
    // Pre-migration fees were collected directly by fly's fee wallet, so all of it is fly revenue.
    await addTokensReceived({ options, balances: dailyFees, targets: [LEGACY_FEE_COLLECTOR] });
    dailyRevenue.addBalances(dailyFees, "Swap Fees");
  } else {
    const logs = await options.getLogs({ target: router, eventAbi: swapEvent });
    for (const log of logs) {
      const { fromAssetAddress, toAssetAddress, amountInSurplus, amountOutSurplus, swapFeeAssetAddresses, swapFeeReceivers, swapFeeAmounts } = log;
      for (let i = 0; i < swapFeeAmounts.length; i++) {
        const token = swapFeeAssetAddresses[i];
        const amount = swapFeeAmounts[i];
        if (FLY_FEE_RECEIVERS.has(swapFeeReceivers[i].toLowerCase())) {
          dailyFees.add(token, amount, "Swap Fees");
          dailyRevenue.add(token, amount, "Swap Fees");
        } else {
          // fee routed to an affiliate / integrator address
          dailyFees.add(token, amount, "Affiliate Fees");
          dailySupplySideRevenue.add(token, amount, "Affiliate Fees");
        }
      }
      // Positive slippage (surplus) retained by fly's router — capped at maxRetentionBps, fly revenue.
      if (amountOutSurplus) {
        dailyFees.add(toAssetAddress, amountOutSurplus, "Surplus");
        dailyRevenue.add(toAssetAddress, amountOutSurplus, "Surplus");
      }
      if (amountInSurplus) {
        dailyFees.add(fromAssetAddress, amountInSurplus, "Surplus");
        dailyRevenue.add(fromAssetAddress, amountInSurplus, "Surplus");
      }
    }
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Swap fees charged by fly.trade's DexAggregator (a conditional 0.01%-0.1% fee on long-tail assets and specific pairs) plus positive slippage (surplus) retained by the router, taken from each Swap event. Pre-2026-05-03 (router migration) fees are taken from the legacy fee collector.",
  Revenue: "Swap fees routed to fly.trade's own fee collector, plus the retained positive slippage (surplus).",
  ProtocolRevenue: "Swap fees and retained surplus kept by fly.trade.",
  SupplySideRevenue: "Swap fees routed to affiliate / integrator addresses (the referral cut).",
};

const breakdownMethodology = {
  Fees: {
    "Swap Fees": "Protocol fee routed to fly.trade's fee collector.",
    "Affiliate Fees": "Fee routed to affiliate / integrator addresses.",
    "Surplus": "Positive slippage retained by fly.trade's router (capped at maxRetentionBps).",
  },
  Revenue: {
    "Swap Fees": "Fees retained by fly.trade.",
    "Surplus": "Positive slippage retained by fly.trade.",
  },
  ProtocolRevenue: {
    "Swap Fees": "Fees retained by fly.trade.",
    "Surplus": "Positive slippage retained by fly.trade.",
  },
  SupplySideRevenue: {
    "Affiliate Fees": "Fees paid out to affiliates / integrators.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  adapter: chainConfig,
};

export default adapter;
