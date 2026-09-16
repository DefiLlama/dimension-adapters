import { Adapter, FetchOptions, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { queryCanisterDecoded } from "../../helpers/icp";
import { PromisePool } from "@supercharge/promise-pool";

// ICLighthouse's aggregator is still the only directory of ICDex pairs, so the pair list
// comes from it, but its `usd_24h_volume` is a cache that is only refreshed when a pair
// trades and is never decayed back to zero, so an idle pair keeps reporting its last busy
// day forever. The volume is read from each pair canister's own stats() instead.
const TICKERS_URL = 'https://gwhbq-7aaaa-aaaar-qabya-cai.raw.icp0.io/v1/tickers';

const STATS_LABELS = ['price', 'change24h', 'vol24h', 'totalVol', 'value0', 'value1'];

const LABEL = 'Spot trades';

// Quote tokens ICDex pairs settle in, mapped to the id used for pricing.
const QUOTE_TOKEN_GECKO_IDS: Record<string, string> = {
  'ryjl3-tyaaa-aaaaa-aaaba-cai': 'internet-computer', // ICP
  'xevnm-gaaaa-aaaar-qafnq-cai': 'chain-key-usdc',    // ckUSDC
  'mxzaz-hqaaa-aaaar-qaada-cai': 'chain-key-bitcoin', // ckBTC
};

interface Ticker {
  ticker_id: string;
  target_currency: string;
  pool_id: string;
}

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
  const tickers: Ticker[] = await fetchURL(TICKERS_URL);
  if (!tickers?.length) throw new Error('ICDex: no pairs returned by the ICLighthouse tickers endpoint');

  const decimalsByToken = new Map<string, number>();
  const getDecimals = async (token: string) => {
    if (!decimalsByToken.has(token))
      decimalsByToken.set(token, Number(await queryCanisterDecoded(token, 'icrc1_decimals')));
    return decimalsByToken.get(token)!;
  };

  // vol24h is the traded amount on each side of the pair over the trailing 24h; the quote
  // leg is used because every pair settles in one of a few liquid tokens.
  const { results, errors } = await PromisePool
    .withConcurrency(5)
    .for(tickers)
    .process(async (ticker) => {
      try {
        const stats = await queryCanisterDecoded(ticker.pool_id, 'stats', STATS_LABELS);
        return { ticker, quoteVolume: BigInt(stats.vol24h.value1) };
      } catch (e: any) {
        // IC0537 means the pair canister has no Wasm module installed, so it cannot trade and
        // its volume is genuinely zero. Every other failure has to surface.
        if (e?.errorCode !== 'IC0537') throw e;
        console.info(`ICDex: pair canister ${ticker.pool_id} has no Wasm module installed (${e?.errorCode}), counting it as zero volume`);
        return { ticker, quoteVolume: 0n };
      }
    });
  if (errors.length) throw errors[0].raw ?? errors[0];

  for (const { ticker, quoteVolume } of results) {
    if (quoteVolume === 0n) continue;
    const geckoId = QUOTE_TOKEN_GECKO_IDS[ticker.target_currency];
    if (!geckoId) throw new Error(`ICDex: no price source for quote token ${ticker.target_currency} (pair ${ticker.ticker_id})`);
    dailyVolume.addCGToken(geckoId, Number(quoteVolume) / 10 ** await getDecimals(ticker.target_currency), LABEL);
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Trailing 24h traded amount reported by each ICDex pair canister's stats() call, valued on the quote-token side of every pair.",
};

const breakdownMethodology = {
  Volume: {
    [LABEL]: "Trailing 24h traded amount on ICDex's order-book pairs, counted once per pair on its quote token (ICP, ckUSDC or ckBTC) so the two sides of a trade are not both counted.",
  },
};

const adapter: Adapter = {
  version: 2,
  // stats() only reports a trailing-24h figure for the moment it is called; there is no hourly
  // series to pull, which is why the chain also runs at current time.
  pullHourly: false,
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2024-01-16',
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
