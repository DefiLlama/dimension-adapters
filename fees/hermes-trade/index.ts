import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";

// Hermes Trade - Polymarket-style prediction market CLOB on Monad.
//
// Realized-revenue methodology (mirrors DefiLlama's fees/polymarket.ts): rather than
// estimating outcome-token (YES/NO) fees at trade-time price, we count the actual USDW
// collateral that flows INTO the protocol FeeVault. Fees taken in outcome tokens are
// redeemed to USDW at settlement and collected here, so this captures realized revenue
// and is unaffected by later fee withdrawals. The two fee modules are intentionally NOT
// counted: on-chain they are pass-through (net ~0), so counting their gross inflows would
// over-count. USDW is a $1, 6-decimal receipt token 1:1 with USDC, priced via the USDC feed.
const USDW = "0xb7bD080Df56FA76ce6CA4fA737d47815f7F8e746";
const USDC = "0x754704Bc059F8C67012fEd69BC8A327a5aafb603";
const FEE_VAULT = "0x222Cfc7134E44b4e2ccDBB59C94933f491660B08";

const fetch = async (options: FetchOptions) => {
  // Realized fees = USDW collected by the FeeVault. Counting inflows (not net balance)
  // keeps the figure correct even after the protocol later withdraws its fees.
  const dailyFees = await addTokensReceived({
    options,
    target: FEE_VAULT,
    tokens: [USDW],
    tokenTransform: () => USDC, // USDW valued 1:1 as USDC ($1, 6 decimals)
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: "2026-05-18",
    },
  },
  methodology: {
    Fees: "Realized trading fees: USDW collateral collected by the Hermes FeeVault, valued 1:1 as USDC. Outcome-token fees are counted once redeemed to USDW at settlement, mirroring DefiLlama's Polymarket fees adapter.",
    Revenue: "All collected fees are retained by the protocol.",
    ProtocolRevenue: "100% of collected fees are protocol revenue.",
  },
};

export default adapter;
