import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";

// Ophis is an intent-based DEX aggregator (a CoW Protocol fork). It holds no TVL.
// Every swap on every chain pays a flat partner fee (10 bps standard, 1 bp on
// stablecoin pairs) via CoW's CIP-75 partner-fee mechanism. The fee is paid in
// the swap's buy/sell token to ONE deterministic CREATE2 fee-recipient address,
// identical on every chain.
const FEE_RECIPIENT = "0x858f0F5eE954846D47155F5203c04aF1819eCeF8";

// Fee activation date. There were no Ophis fees before this, so a slightly
// earlier start is harmless.
const START = "2026-06-08";

const fetch = async (options: FetchOptions) => {
  // dailyFees = dailyRevenue = USD value of all tokens RECEIVED by the
  // fee-recipient address on this chain for the day. This figure is already net
  // of CoW's revenue share on CoW-hosted chains (Ophis self-hosts only on
  // Optimism); option A deliberately reports the on-chain received amount and
  // does not estimate gross volume.
  const dailyFees = await addTokensReceived({ target: FEE_RECIPIENT, options });
  return { dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Fees: "Flat partner fee taken on every Ophis swap (10 bps standard, 1 bp on stablecoin pairs), measured as the USD value of all tokens received by the deterministic CREATE2 fee-recipient address 0x858f0F5eE954846D47155F5203c04aF1819eCeF8, which is identical on every chain.",
  Revenue: "All collected partner fees retained by Ophis. Equal to fees; this is the on-chain amount received by the fee recipient, already net of CoW's revenue share on CoW-hosted chains (Ophis self-hosts only on Optimism).",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology,
  adapter: {
    [CHAIN.ETHEREUM]: { start: START },
    [CHAIN.OPTIMISM]: { start: START },
    [CHAIN.BSC]: { start: START },
    [CHAIN.XDAI]: { start: START },
    [CHAIN.POLYGON]: { start: START },
    [CHAIN.BASE]: { start: START },
    [CHAIN.ARBITRUM]: { start: START },
    [CHAIN.AVAX]: { start: START },
    [CHAIN.LINEA]: { start: START },
    [CHAIN.INK]: { start: START },
    [CHAIN.PLASMA]: { start: START },
  },
};

export default adapter;
