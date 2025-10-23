import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TREASURY = "0x21ad6eF3979638d8e73747f22B92C4AadE145D82".toLowerCase();
const start = "2025-08-11";

// safe-pick:  slug or undefined
function pick(...keys: string[]) {
  for (const k of keys) {
    const v = (CHAIN as any)[k];
    if (typeof v === "string" && v.length) return v;
  }
  return undefined;
}

const CANDIDATE_SLUGS = [
  pick('ETHEREUM'), pick('BASE'), pick('OPTIMISM'), pick('ARBITRUM'),
  pick('BSC'), pick('POLYGON'), pick('AVAX'),
  pick('SCROLL'), pick('MANTLE'), pick('LINEA'),
  pick('BERACHAIN'),
  pick('CORE','COREDAO'),
  pick('REDSTONE'),
  pick('UNICHAIN'),
  pick('INK'),
  pick('SONEIUM'),
  pick('PLUME_MAINNET','PLUME'),
  pick('ZORA'),
  pick('BLAST'),
  pick('MODE'),
  pick('METIS'),
  pick('RONIN'),
  pick('XDAI','GNOSIS'),
  pick('CELO'),
  pick('CONFLUX'),
  pick('LISK'),
  pick('APECHAIN'),
  pick('XLAYER','X_LAYER'),
  pick('BTNX','BOTANIX'),
  pick('BOB'),
  pick('ABSTRACT'),
  pick('ZIRCUIT'),
  pick('MORPH'),
  pick('MANTA','MANTA_PACIFIC'),
  pick('ANCIENT8'),
  pick('KLAYTN','KAIA'),
  pick('CRONOS'),
  pick('XAI'),
  pick('WORLDCHAIN','WORLD_CHAIN'),
].filter(Boolean) as string[];

function buildFetch(_chain: string) {
  return async (opts: FetchOptions) => {
    const dailyRevenue = opts.createBalances();
    try {
      const [balStart, balEnd] = await Promise.all([
        opts.getBalance({ target: TREASURY, block: opts.fromBlock }),
        opts.getBalance({ target: TREASURY, block: opts.toBlock }),
      ]);
      const delta = BigInt(balEnd as any) - BigInt(balStart as any);
      if (delta > 0n) dailyRevenue.addGasToken(delta); // net inflow per day
    } catch {
    }
    return { dailyRevenue };
  };
}

// build adapter without undefined
const adapterEntries = CANDIDATE_SLUGS.map((slug) => [
  slug,
  { fetch: buildFetch(slug), start },
] as const);

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(adapterEntries),
  methodology: {
    Revenue:
      "Daily net inflow into treasury 0x21ad6eF... per chain’s native token: balance(endOfDay) − balance(startOfDay). " +
      "Same-day outflows can zero the metric. Gross dailyFees will be added later via on-chain log parsing.",
  },
};

export default adapter;
