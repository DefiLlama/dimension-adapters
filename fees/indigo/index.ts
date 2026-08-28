import axios from "axios";
import { Balances } from "@defillama/sdk";
import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const ANALYTICS_API_ENDPOINT = 'https://analytics.indigoprotocol.io';

const fetchRevenueTotals = async (endpoint: string, options: FetchOptions): Promise<Record<string, string | number>> => {
  const url = `${ANALYTICS_API_ENDPOINT}/api/revenue/${endpoint}?totals&inflows_only&from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const { data } = await axios.get(url);
  if (!data || typeof data.totals !== 'object' || data.totals === null) {
    throw new Error(`Indigo ${endpoint} returned an unexpected response: ${JSON.stringify(data)?.slice(0, 200)}`);
  }
  return data.totals;
};

const addTotals = (balances: Balances, totals: Record<string, string | number>) => {
  for (const [unit, amount] of Object.entries(totals)) {
    const raw = Number(amount);
    if (!raw) continue;
    if (unit === 'lovelace') {
      balances.addCGToken('cardano', raw / 1_000_000);
    } else {
      balances.add(unit, raw);
    }
  }
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  // Fees are CDP fees paid by users: mint fees, interest payments, and redemption fees,
  // collected by the Treasury and by INDY stakers.
  //
  // Liquidations are intentionally NOT counted as fees: when a CDP is liquidated, its ADA
  // collateral is distributed to Stability Pool depositors (who burn their iAssets to cover
  // the debt). That collateral is the protocol's own TVL passing to other users, not a fee
  // paid to the protocol, so including it overstates fees. This matches how other
  // CDP/stability-pool adapters count liquidations (only the liquidation fee/penalty, never
  // the seized collateral).

  // Collector Flows are all fees that are sent to INDY stakers:
  // CDP Mint Fees, (partially) CDP Interest Payments, and Redemption Fees.
  const collectorTotals = await fetchRevenueTotals('collector-flows', options);

  // Treasury captures the following assets: ADA, INDY, iUSD, iBTC, iETH, and iSOL.
  // This collects: CDP Interest Payments (to treasury), INDY returned from emissions, and buybacks.
  const treasuryTotals = await fetchRevenueTotals('flows', options);

  const dailyFees = options.createBalances();
  addTotals(dailyFees, treasuryTotals);
  addTotals(dailyFees, collectorTotals);

  const dailyRevenue = options.createBalances();
  addTotals(dailyRevenue, treasuryTotals);
  addTotals(dailyRevenue, collectorTotals);

  const dailyProtocolRevenue = options.createBalances();
  addTotals(dailyProtocolRevenue, treasuryTotals);

  const dailyHoldersRevenue = options.createBalances();
  addTotals(dailyHoldersRevenue, collectorTotals);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};


const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: '2022-11-22',
    },
  },
  methodology: {
    Fees: "CDP fees paid by users (mint fees, interest payments, and redemption fees), collected by the Treasury and INDY stakers. Excludes liquidated collateral, which is distributed to Stability Pool depositors rather than paid to the protocol.",
    Revenue: "CDP fees collected by the Treasury and distributed to INDY stakers.",
    ProtocolRevenue: "CDP fees captured by the Indigo Treasury.",
    HoldersRevenue: "CDP fees distributed to INDY stakers.",
  }
};

export default adapter;
