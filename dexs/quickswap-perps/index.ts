import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderSymmioPerpsByName } from "../../helpers/symmio";
import { getBuilderExports } from "../../helpers/orderly";

// https://docs.quickswap.exchange/overview/perps
// Falkor runs on Orderly Network under broker_id "quick_perps".
const orderly = getBuilderExports({ broker_id: "quick_perps" });

const adapter: Adapter = {
  version: 1,
  doublecounted: true,
  methodology: {
    Volume: 'Perps trading volume routed through QuickSwap on Base (SYMMIO) and Falkor (Orderly Network).',
    Fees: 'Affiliate fees on Base (SYMMIO) and builder fees on Falkor (Orderly) earned by QuickSwap.',
    Revenue: 'Affiliate fees on Base (SYMMIO) and builder fees on Falkor (Orderly) earned by QuickSwap.',
    ProtocolRevenue: 'Affiliate/builder fees retained by QuickSwap.',
    OpenInterest: 'Open interest from QuickPerps on Base (SYMMIO); Falkor/Orderly does not report OI.',
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch: fetchBuilderSymmioPerpsByName("Quickswap"),
    },
    [CHAIN.ORDERLY]: {
      // Orderly omits no-trade days (orderly.fetch throws); return empty so an
      // Orderly gap doesn't fail the whole protocol and drop the Base data.
      fetch: (options) => orderly.fetch!(options).catch(() => ({})),
    },
  },
};

export default adapter;
