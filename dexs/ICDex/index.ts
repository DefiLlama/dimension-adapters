import { Adapter, FetchOptions, FetchResultVolume } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains";
import { callCanister, queryCanisterDecoded } from "../../helpers/icp";
import { PromisePool } from "@supercharge/promise-pool";

const ICDEX_ROUTER = 'i5jcx-ziaaa-aaaar-qaazq-cai';
const PAGE_SIZE = 100;
const PAIR_LABELS = ['data', 'total', 'totalPage', 'canisterId', 'token0', 'token1'];

const STATS_LABELS = ['price', 'change24h', 'vol24h', 'totalVol', 'value0', 'value1'];

const LABEL = 'Spot trades';

const QUOTE_TOKEN_GECKO_IDS: Record<string, string> = {
  'ryjl3-tyaaa-aaaaa-aaaba-cai': 'internet-computer', // ICP
  'xevnm-gaaaa-aaaar-qafnq-cai': 'chain-key-usdc',    // ckUSDC
  'cngnf-vqaaa-aaaar-qag4q-cai': 'chain-key-usdt',    // ckUSDT
  'mxzaz-hqaaa-aaaar-qaada-cai': 'chain-key-bitcoin', // ckBTC
};

const EXCLUDED_QUOTE_TOKENS = new Set(['f5qzk-3iaaa-aaaak-adpza-cai']);

interface Pair {
  pairId: string;
  symbol: string;
  quoteToken: string;
}

const getPairs = async (): Promise<Pair[]> => {
  const pairs: Pair[] = [];
  for (let page = 1, totalPage = 1; page <= totalPage; page++) {
    const res = await callCanister({
      canisterId: ICDEX_ROUTER,
      method: 'getPairs',
      args: [{ type: { opt: 'nat' }, value: [page] }, { type: { opt: 'nat' }, value: [PAGE_SIZE] }],
      labels: PAIR_LABELS,
    });
    totalPage = Number(res.totalPage);
    for (const entry of res.data)
      pairs.push({ pairId: entry[0], symbol: `${entry[1].token0[1]}/${entry[1].token1[1]}`, quoteToken: entry[1].token1[0] });
  }
  return pairs;
};

const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = options.createBalances();
  const pairs = (await getPairs()).filter((pair) => !EXCLUDED_QUOTE_TOKENS.has(pair.quoteToken));
  if (!pairs.length) throw new Error('ICDex: no pairs returned by ICDexRouter getPairs');

  const decimalsByToken = new Map<string, number>();
  const getDecimals = async (token: string) => {
    if (!decimalsByToken.has(token))
      decimalsByToken.set(token, Number(await queryCanisterDecoded(token, 'icrc1_decimals')));
    return decimalsByToken.get(token)!;
  };

  const { results, errors } = await PromisePool
    .withConcurrency(5)
    .for(pairs)
    .process(async (pair) => {
      try {
        const stats = await queryCanisterDecoded(pair.pairId, 'stats', STATS_LABELS);
        return { pair, quoteVolume: BigInt(stats.vol24h.value1) };
      } catch (e: any) {
        if (e?.errorCode !== 'IC0537') throw e;
        console.info(`ICDex: pair canister ${pair.pairId} has no Wasm module installed (${e?.errorCode}), counting it as zero volume`);
        return { pair, quoteVolume: 0n };
      }
    });
  if (errors.length) throw errors[0].raw ?? errors[0];

  for (const { pair, quoteVolume } of results) {
    if (quoteVolume === 0n) continue;
    const geckoId = QUOTE_TOKEN_GECKO_IDS[pair.quoteToken];
    if (!geckoId) throw new Error(`ICDex: no price source for quote token ${pair.quoteToken} (pair ${pair.symbol} ${pair.pairId})`);
    dailyVolume.addCGToken(geckoId, Number(quoteVolume) / 10 ** await getDecimals(pair.quoteToken), LABEL);
  }

  return { dailyVolume };
};

const methodology = {
  Volume: "Trailing 24h traded amount reported by each ICDex pair canister's stats() call, valued on the quote-token side of every pair.",
};

const adapter: Adapter = {
  version: 2,
  pullHourly: false,
  adapter: {
    [CHAIN.ICP]: {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2024-01-16',
    },
  },
  methodology,
};

export default adapter;
