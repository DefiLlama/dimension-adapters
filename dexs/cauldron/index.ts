// This adaptor uses the Riftenlabs Indexer API to query for volume and fees.
//
// This indexer is open source (AGPLv3) and available at:
// https://gitlab.com/riftenlabs/riftenlabs-indexer
// https://docs.riftenlabs.com/cauldron/knowledge-base/#what-are-the-trade-fees

import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";

const INDEXER_URL = "https://indexer.cauldron.quest";
const FEE_RATE = 0.003; // 0.3% fee on every trade, all goes to LPs
const COIN = 1e8;

const methodology = {
  Volume: "Scrape the blockchain and filter for spent transaction outputs that match the cauldron contract's redeem script. Check if the transaction has an output with a locking script that matches the redeem script in the input. A match on locking script means the funds are still locked in the DEX contract. Aggregate the difference of funds in contract utxos as trade volume.",
  Fees: "0.3% fee charged on every swap through Cauldron liquidity pools, calculated from daily trading volume.",
  UserFees: "All fees are paid by traders as a 0.3% swap fee.",
  Revenue: "Cauldron has no protocol fee — all swap fees go to liquidity providers.",
  SupplySideRevenue: "100% of the 0.3% swap fee is earned by liquidity providers.",
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
  options: FetchOptions
): Promise<FetchResult> {
  const endpoint = `${INDEXER_URL}/cauldron/contract/volume?end=${options.toTimestamp}`;
  const volume = await fetchURL(endpoint)

  const daily_sats = volume.reduce((acc: number, token: any) => {
    return acc + Number(token.one_day_sats)
  }, Number(0));

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const volumeBch = daily_sats / COIN;
  const feeBch = volumeBch * FEE_RATE;

  dailyVolume.addCGToken('bitcoin-cash', volumeBch);
  dailyFees.addCGToken('bitcoin-cash', feeBch);
  dailyUserFees.addCGToken('bitcoin-cash', feeBch);
  dailySupplySideRevenue.addCGToken('bitcoin-cash', feeBch);

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailySupplySideRevenue,
    dailyRevenue: 0,
  };
}

export default adapter;
