import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const TREASURY = "0x21ad6eF3979638d8e73747f22B92C4AadE145D82".toLowerCase();
const start = "2025-08-11";


function buildFetch(_chain: string) {
  return async (opts: FetchOptions) => {
    const dailyRevenue = opts.createBalances();
    try {
      const [balStart, balEnd] = await Promise.all([
        opts.getBalance({ target: TREASURY, block: opts.fromBlock }),
        opts.getBalance({ target: TREASURY, block: opts.toBlock }),
      ]);
      const delta = BigInt(balEnd as any) - BigInt(balStart as any);
      if (delta > 0n) dailyRevenue.addGasToken(delta);
    } catch {

    }
    return { dailyRevenue };
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: { fetch: buildFetch(CHAIN.ETHEREUM), start },
    [CHAIN.BASE]: { fetch: buildFetch(CHAIN.BASE), start },
    [CHAIN.OPTIMISM]: { fetch: buildFetch(CHAIN.OPTIMISM), start },
    [CHAIN.ARBITRUM]: { fetch: buildFetch(CHAIN.ARBITRUM), start },
    [CHAIN.BSC]: { fetch: buildFetch(CHAIN.BSC), start },
    [CHAIN.POLYGON]: { fetch: buildFetch(CHAIN.POLYGON), start },
    [CHAIN.AVAX]: { fetch: buildFetch(CHAIN.AVAX), start },
    [CHAIN.SCROLL]: { fetch: buildFetch(CHAIN.SCROLL), start },
    [CHAIN.MANTLE]: { fetch: buildFetch(CHAIN.MANTLE), start },
    [CHAIN.LINEA]: { fetch: buildFetch(CHAIN.LINEA), start },
    [CHAIN.BERACHAIN]: { fetch: buildFetch(CHAIN.BERACHAIN), start },
    [CHAIN.CORE]: { fetch: buildFetch(CHAIN.CORE), start },
    [CHAIN.REDSTONE]: { fetch: buildFetch(CHAIN.REDSTONE), start },
    [CHAIN.UNICHAIN]: { fetch: buildFetch(CHAIN.UNICHAIN), start },
    [CHAIN.INK]: { fetch: buildFetch(CHAIN.INK), start },
    [CHAIN.SONEIUM]: { fetch: buildFetch(CHAIN.SONEIUM), start },
    [CHAIN.PLUME_MAINNET]: { fetch: buildFetch(CHAIN.PLUME_MAINNET), start },
    [CHAIN.ZORA]: { fetch: buildFetch(CHAIN.ZORA), start },
    [CHAIN.BLAST]: { fetch: buildFetch(CHAIN.BLAST), start },
    [CHAIN.MODE]: { fetch: buildFetch(CHAIN.MODE), start },
    [CHAIN.METIS]: { fetch: buildFetch(CHAIN.METIS), start },
    [CHAIN.RONIN]: { fetch: buildFetch(CHAIN.RONIN), start },
    [CHAIN.XDAI]: { fetch: buildFetch(CHAIN.XDAI), start },           
    [CHAIN.CELO]: { fetch: buildFetch(CHAIN.CELO), start },
    [CHAIN.CONFLUX]: { fetch: buildFetch(CHAIN.CONFLUX), start },
    [CHAIN.LISK]: { fetch: buildFetch(CHAIN.LISK), start },
    [CHAIN.APECHAIN]: { fetch: buildFetch(CHAIN.APECHAIN), start },
    [CHAIN.XLAYER]: { fetch: buildFetch(CHAIN.XLAYER), start },
    [CHAIN.BTNX]: { fetch: buildFetch(CHAIN.BTNX), start },           
    [CHAIN.BOB]: { fetch: buildFetch(CHAIN.BOB), start },
    [CHAIN.ABSTRACT]: { fetch: buildFetch(CHAIN.ABSTRACT), start },
    [CHAIN.ZIRCUIT]: { fetch: buildFetch(CHAIN.ZIRCUIT), start },
    [CHAIN.MORPH]: { fetch: buildFetch(CHAIN.MORPH), start },
    [CHAIN.MANTA]: { fetch: buildFetch(CHAIN.MANTA), start },
    [CHAIN.ANCIENT8]: { fetch: buildFetch(CHAIN.ANCIENT8), start },
    [CHAIN.KLAYTN]: { fetch: buildFetch(CHAIN.KLAYTN), start },       
    [CHAIN.CRONOS]: { fetch: buildFetch(CHAIN.CRONOS), start },
    [CHAIN.XAI]: { fetch: buildFetch(CHAIN.XAI), start },
    [CHAIN.WORLDCHAIN]: { fetch: buildFetch(CHAIN.WORLDCHAIN), start },
  },
  methodology: {
    Revenue:
      "Daily net inflow into treasury per chain’s native token: balance(endOfDay) − balance(startOfDay). " +
      "Same-day outflows can zero out the metric. Gross dailyFees will be added later via on-chain log parsing.",
  },
};

export default adapter;
