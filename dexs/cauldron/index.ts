// This adaptor uses the Riftenlabs Indexer API to query for volume.
//
// This indexer is open source (AGPLv3) and available at:
// https://gitlab.com/riftenlabs/riftenlabs-indexer

import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const INDEXER_URL = "https://indexer.cauldron.quest";

const methodology = {
  Volume: "Scrape the blockchain and filter for spent transaction outputs that match the cauldron contract's redeem script. Check if the transaction has an output with a locking script that matches the redeem script in the input. A match on locking script means the funds are still locked in the DEX contract. Aggregate the difference of funds in contract utxos as trade volume.",
}

const adapter: SimpleAdapter = {
  methodology,
  adapter: {
    [CHAIN.BITCOIN_CASH]: {
      fetch: fetchCauldronVolume,
      start: '2023-07-01',
    },
  },
};

export async function fetchCauldronVolume(
  timestamp: number, _, options: FetchOptions
): Promise<FetchResult> {
  const endpoint = `${INDEXER_URL}/cauldron/contract/volume?end=${timestamp}`;
  const volume = await fetchURL(endpoint)

  const total_sats = volume.reduce((acc, token) => {
    return acc + Number(token.total_sats)
  }, Number(0));

  const daily_sats = volume.reduce((acc, token) => {
      return acc + Number(token.one_day_sats)
  }, Number(0));

  const COIN = 100000000;

  const dailyVolume = options.createBalances();
  const totalVolume = options.createBalances();

  dailyVolume.addCGToken('bitcoin-cash', Number(daily_sats / COIN));
  totalVolume.addCGToken('bitcoin-cash', Number(total_sats / COIN));

  return {
    timestamp,
    dailyVolume,
    totalVolume,
  };
}

export default adapter;
