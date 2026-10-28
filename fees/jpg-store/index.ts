import { Adapter, FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { blockfrost } from "../../helpers/cardano";

// jpg.store v3 marketplace address: receives 2% fee outputs (ADA-only) from
// every NFT sale settled by the ask.spend validator.
// Payment script:   84cc25ea4c29951d40b443b95bbc5676bc425470f96376d1984af9ab
// Stake script:     2c967f4bd28944b06462e13c5e3f5d5fa6e03f8567569438cd833e6d
const MARKETPLACE_ADDR =
  "addr1xxzvcf02fs5e282qk3pmjkau2emtcsj5wrukxak3np90n2evjel5h55fgjcxgchp830r7h2l5msrlpt8262r3nvr8eksg6pw3p";

async function getMarketplaceFees(start: number, end: number): Promise<number> {
  let page = 1;
  let totalLovelace = 0;

  while (true) {
    const txs = await blockfrost(
      `/addresses/${MARKETPLACE_ADDR}/transactions?page=${page}&order=desc`
    );

    if (!txs || txs.length === 0) break;

    const txsInWindow = txs.filter(
      (tx: any) => tx.block_time >= start && tx.block_time <= end
    );
    const pastWindow = txs.some((tx: any) => tx.block_time < start);

    const utxoResults = await Promise.all(
      txsInWindow.map((tx: any) => blockfrost(`/txs/${tx.tx_hash}/utxos`))
    );

    for (const utxos of utxoResults) {
      for (const output of utxos.outputs) {
        if (output.address !== MARKETPLACE_ADDR) continue;
        // Fee outputs are pure ADA. Listings always carry the NFT token,
        // so any output with >1 asset is a listing/migration, not a fee.
        if (output.amount.length !== 1) continue;
        const lovelaceOut = output.amount[0];
        if (lovelaceOut.unit !== "lovelace") continue;
        totalLovelace += Number(lovelaceOut.quantity);
      }
    }

    if (pastWindow) break;
    page++;
  }

  return totalLovelace / 1_000_000;
}

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyFees = options.createBalances();
  const ada = await getMarketplaceFees(
    options.startTimestamp,
    options.endTimestamp
  );
  dailyFees.addCGToken("cardano", ada);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.CARDANO]: {
      fetch,
      start: "2024-06-08",
    },
  },
  methodology: {
    Fees: "2% marketplace fee collected at the jpg.store v3 marketplace contract on each NFT sale.",
    UserFees: "2% marketplace fee paid by sellers on each NFT sale.",
    Revenue: "All marketplace fees collected by the jpg.store protocol.",
    ProtocolRevenue: "All marketplace fees collected by the jpg.store protocol.",
  },
};

export default adapter;
