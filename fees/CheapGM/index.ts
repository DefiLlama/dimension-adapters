
import { Adapter, FetchOptions } from "../../adapters/types";

const TREASURY = "0x21ad6eF3979638d8e73747f22B92C4AadE145D82".toLowerCase();

const CHAINS = [
  'ethereum','base','optimism','arbitrum','polygon','bsc',
  'scroll','mantle','linea','zksync','taiko','blast','mode','zora','metis',
  'cronos','celo','conflux','ronin','lisk',
  'berachain','core','redstone','morph','zircuit',
  'apechain','ancient8','degen','botanix','mezo','bob','world-chain',
  'abstract','soneium','ink','unichain','plume','gravity','sonic','manta',
  'polygon-zkevm',
] as const;

function buildFetch(chain: string) {
  return async (opts: FetchOptions) => {
    const dailyRevenue = opts.createBalances();

    try {
      const balStart = await opts.getBalance({ target: TREASURY, block: opts.fromBlock });
      const balEnd   = await opts.getBalance({ target: TREASURY, block: opts.toBlock });

      const delta = (BigInt(balEnd as any) - BigInt(balStart as any));
      if (delta > 0n) {
        
        dailyRevenue.addGasToken(delta);
      }
    } catch {
      
    }

    return { dailyRevenue };
  };
}



const adapterPerChain: Record<string, any> = {};
for (const c of CHAINS) {
  adapterPerChain[c] = { fetch: buildFetch(c), start: "2025-08-11" }; 
}

const adapter: Adapter = {
  version: 2,
  adapter: adapterPerChain as any,
  methodology: {
    Revenue:
      "Daily net increase in treasury address balance in each chain's native token (net inflow). " +
      "If there were outgoing payments from the treasury on the same day, the value will be understated against the gross inflow.",
  },
};

export default adapter;
