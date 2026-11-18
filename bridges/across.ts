import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { acrossChains, AcrossDeposit, prefetchAcrossDeposits } from "../helpers/across";

// Deposits come from the shared origin-chain scan in helpers/across.ts (also used by fees/across.ts).
// Each chain slices that list: deposits leaving it and fills arriving on it, attributed by deposit time.

const REVERTED_STATUSES = new Set(["expired", "refunded"]);

const fetch = async (options: FetchOptions) => {
  const deposits = options.preFetchedResults as AcrossDeposit[];
  const { chainId } = acrossChains[options.chain];
  const dailyOutgoingVolume = options.createBalances();
  const dailyIncomingVolume = options.createBalances();
  let dailyOutgoingTxCount = 0;
  let dailyIncomingTxCount = 0;

  for (const d of deposits) {
    // expired and refunded deposits never left the origin chain (funds returned to the depositor)
    if (d.originChainId === chainId && !REVERTED_STATUSES.has(d.status) && d.inputToken && d.inputAmount) {
      dailyOutgoingVolume.add(d.inputToken, d.inputAmount);
      dailyOutgoingTxCount++;
    }
    if (d.destinationChainId === chainId && d.status === "filled" && d.outputToken && d.outputAmount) {
      dailyIncomingVolume.add(d.outputToken, d.outputAmount);
      dailyIncomingTxCount++;
    }
  }

  return { dailyOutgoingVolume, dailyIncomingVolume, dailyOutgoingTxCount, dailyIncomingTxCount };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  prefetch: prefetchAcrossDeposits as any,
  adapter: Object.fromEntries(
    Object.entries(acrossChains).map(([chain, { start, deadFrom }]) => [chain, { ...(start && { start }), ...(deadFrom && { deadFrom }) }])
  ),
  methodology: {
    OutgoingVolume: "USD value of deposits into the Across SpokePool on each chain, from the Across indexer API.",
    IncomingVolume: "USD value of filled relays delivered on each chain, attributed to the time of their deposit.",
    OutgoingTxCount: "Number of deposits initiated on each chain.",
    IncomingTxCount: "Number of filled relays delivered on each chain.",
  },
};

export default adapter;
