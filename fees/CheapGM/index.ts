import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TREASURY = "0x21ad6eF3979638d8e73747f22B92C4AadE145D82".toLowerCase();
const start = "2025-08-11";


function pick(...keys: string[]) {
  for (const k of keys) {
    const v = (CHAIN as any)[k];
    if (typeof v === "string" && v.length) return v;       
  }
  return undefined;
}

function toBig(v: any): bigint {
  try {
    if (v == null) return 0n;
    if (typeof v === "bigint") return v;
    if (typeof v === "number") return BigInt(Math.trunc(v));
    if (typeof v === "string") return v.startsWith("0x") ? BigInt(v) : BigInt(v);
  } catch {}
  return 0n;
}

async function txNetInflow(opts: FetchOptions): Promise<bigint> {
  const anyOpts = opts as any;
  if (typeof anyOpts.getTransactions !== "function") return 0n;

  const from_block = anyOpts.fromBlock;
  const to_block = anyOpts.toBlock;

  const toTx = (await anyOpts.getTransactions({
    addresses: [TREASURY],
    from_block,
    to_block,
    transactionType: "to",
  }).catch(() => [])) as any[];

  const fromTx = (await anyOpts.getTransactions({
    addresses: [TREASURY],
    from_block,
    to_block,
    transactionType: "from",
  }).catch(() => [])) as any[];

  const inflow = toTx.reduce((a, tx) => a + toBig(tx.value ?? tx.valueHex ?? 0), 0n);
  const outflow = fromTx.reduce((a, tx) => a + toBig(tx.value ?? tx.valueHex ?? 0), 0n);
  return inflow - outflow;
}


const CANDIDATE_SLUGS = [
  // core
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
    let needFallback = false;


    try {
      const [balStart, balEnd] = await Promise.all([
        opts.getBalance({ target: TREASURY, block: (opts as any).fromBlock }),
        opts.getBalance({ target: TREASURY, block: (opts as any).toBlock }),
      ]);
      const delta = toBig(balEnd) - toBig(balStart);
      if (delta > 0n) dailyRevenue.addGasToken(delta);
      else needFallback = true;            
    } catch {
      needFallback = true;                  
    }

    if (needFallback) {
      const net = await txNetInflow(opts).catch(() => 0n);
      if (net > 0n) dailyRevenue.addGasToken(net);
    }

    return { dailyRevenue };
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(
    CANDIDATE_SLUGS.map((slug) => [slug, { fetch: buildFetch(slug), start }]),
  ),
  methodology: {
    Revenue:
      "Daily net inflow into treasury  per chain’s native token. " +
      "Primary = Δbalance on start/end blocks; fallback = inflow(to) − outflow(from) by tx scan over the day. " +
      "Same-day outflows can zero the metric; UI shows rounded USD for daily view.",
  },
};

export default adapter;
