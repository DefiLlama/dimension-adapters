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
  const from_block = (opts as any).fromBlock;
  const to_block = (opts as any).toBlock;

  const toTx = await opts.getTransactions({
    addresses: [TREASURY],
    from_block,
    to_block,
    transactionType: "to",
  }).catch(() => []);

  const fromTx = await opts.getTransactions({
    addresses: [TREASURY],
    from_block,
    to_block,
    transactionType: "from",
  }).catch(() => []);

  const inflow = (toTx as any[]).reduce((a, tx) => a + toBig(tx.value ?? tx.valueHex ?? tx.inputValue ?? 0), 0n);
  const outflow = (fromTx as any[]).reduce((a, tx) => a + toBig(tx.value ?? tx.valueHex ?? tx.inputValue ?? 0), 0n);
  return inflow - outflow;
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


    let usedFallback = false;
    try {
      const [balStart, balEnd] = await Promise.all([
        opts.getBalance({ target: TREASURY, block: (opts as any).fromBlock }),
        opts.getBalance({ target: TREASURY, block: (opts as any).toBlock }),
      ]);
      const delta = toBig(balEnd) - toBig(balStart);
      if (delta > 0n) dailyRevenue.addGasToken(delta);
      else usedFallback = true;             
    } catch {
      usedFallback = true;                  
    }


    if (usedFallback) {
      const net = await txNetInflow(opts);
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
      "Net inflow into treasury per day: primary = balance on start/end blocks; " +
      "fallback = sum(native inflow to treasury) − sum(native outflow from treasury) between the day’s blocks. " +
      "Same-day outflows can zero the metric; rounding in UI applies.",
  },
};

export default adapter;
