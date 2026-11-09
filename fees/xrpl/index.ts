import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import "../../helpers/env";

// Every transaction included in a validated ledger burns its fee, whether it succeeded (tes) or failed with a tec
// code, and burning is the only way XRP leaves the supply. So the fees for a period are the drop in the ledger's
// total_coins between the last validated ledgers closed at the start and at the end of the period.
async function totalCoinsAt(timestamp: number): Promise<bigint> {
  const { number } = await sdk.chains.xrpl.getLedgerAtTimestamp({ timestamp });
  const { ledger } = await sdk.chains.xrpl.rpc("ledger", { ledger_index: number });
  return BigInt(ledger.total_coins);
}

const fetch = async (options: FetchOptions) => {
  const [start, end] = await Promise.all([
    totalCoinsAt(options.startTimestamp),
    totalCoinsAt(options.endTimestamp),
  ]);
  const burnedDrops = start - end;
  if (burnedDrops < 0n) throw new Error(`xrpl: total_coins grew between ${options.startTimestamp} and ${options.endTimestamp}`);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("ripple", Number(burnedDrops) / 1e6);
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.RIPPLE],
  start: '2023-12-16',
  methodology: {
    Fees: 'Transaction fees paid on the XRPL, measured as the drop in total XRP supply (total_coins) between validated ledgers. Includes fees of transactions that were included but failed (tec results), which are burned too.',
    Revenue: 'All fees are burned.',
  },
};

export default adapter;
