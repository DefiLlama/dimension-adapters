import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// fly.trade migrated to a new DexAggregator router on 2026-05-03. Before that, protocol fees
// accrued to a legacy fee collector; after, each swap emits its fee token(s) + amount(s) directly.
const MIGRATION_TS = 1777766400; 
const LEGACY_FEE_COLLECTOR = "0xd39B2A01D4dca42F32Ff52244a1b28811e40045F";

// DexAggregator router addresses. Source: https://docs.fly.trade/developers/deployments
const ROUTER_A = "0x20f6ee51340adeed01a59b0e65cb3703f3dc860c"; // default deployment (most chains)
const ROUTER_B = "0xf5f3b8faf45023fd92c0c88fedf73fb0529fc1cd"; // polygon_zkevm, taiko, telos
const ROUTER_C = "0xc5b20203b6807e742853c96ce7dcfb1e7b201c0a"; // zksync era
const ROUTER_D = "0xf702814d2e1290f3d5f3202565df46272e1b1b92"; // metis, fantom, pharos


const swapEvent =
  "event Swap(address fromAddress, address toAddress, address fromAssetAddress, address toAssetAddress, uint256 amountIn, uint256 amountOut, uint256 expectedAmountOut, uint256 amountInSurplus, uint256 amountOutSurplus, bytes32 consumerId, address[] swapFeeAssetAddresses, address[] swapFeeReceivers, uint256[] swapFeeAmounts)";

const getFetch = (router = ROUTER_A) => async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  if (options.startTimestamp < MIGRATION_TS) {
    await addTokensReceived({ options, balances: dailyFees, targets: [LEGACY_FEE_COLLECTOR] });
  } else {
    const logs = await options.getLogs({ target: router, eventAbi: swapEvent });
    for (const log of logs) {
      for (let i = 0; i < log.swapFeeAmounts.length; i++) {
        dailyFees.add(log.swapFeeAssetAddresses[i], log.swapFeeAmounts[i]);
      }
    }
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
};

const methodology = {
  Fees: "Protocol swap fees charged by fly.trade — a conditional 0.01%-0.1% fee on long-tail assets and specific pairs. Since the 2026-05-03 router migration these are summed from the swapFeeAmounts of each DexAggregator Swap event; earlier fees are taken from the legacy fee collector.",
  Revenue: "All fly.trade swap fees are retained by the protocol.",
  ProtocolRevenue: "All fly.trade swap fees are retained by the protocol.",
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  methodology,
  fetch: getFetch(),
  start: "2025-08-18",
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.ARBITRUM,
    CHAIN.OPTIMISM,
    CHAIN.BASE,
    CHAIN.BSC,
    CHAIN.POLYGON,
    CHAIN.AVAX,
    CHAIN.SCROLL,
    CHAIN.MANTA,
    CHAIN.LINEA,
  ],
  // chains that differ by router address and/or start date
  adapter: {
    [CHAIN.METIS]: { fetch: getFetch(ROUTER_D), start: "2025-08-18" },
    [CHAIN.FANTOM]: { fetch: getFetch(ROUTER_D), start: "2025-08-18" },
    [CHAIN.BERACHAIN]: { fetch: getFetch(), start: "2025-08-20" },
    [CHAIN.TAIKO]: { fetch: getFetch(ROUTER_B), start: "2025-08-20" },
    [CHAIN.INK]: { fetch: getFetch(), start: "2025-11-01" },
    [CHAIN.BLAST]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.SONIC]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.UNICHAIN]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.ABSTRACT]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.HYPERLIQUID]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.KATANA]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.MONAD]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.PLASMA]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.MEGAETH]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.MORPH]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.STABLE]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.OG]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.TEMPO]: { fetch: getFetch(), start: "2026-05-03" },
    [CHAIN.POLYGON_ZKEVM]: { fetch: getFetch(ROUTER_B), start: "2026-05-03" },
    [CHAIN.TELOS]: { fetch: getFetch(ROUTER_B), start: "2026-05-03" },
    [CHAIN.ERA]: { fetch: getFetch(ROUTER_C), start: "2026-05-03" },
    [CHAIN.PHAROS]: { fetch: getFetch(ROUTER_D), start: "2026-05-03" },
  },
};

export default adapter;
