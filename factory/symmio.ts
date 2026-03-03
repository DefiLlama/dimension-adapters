import { symmioAffiliateAdapter } from "../helpers/symmio";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

// protocol name -> [affiliateName, chains]
const dexsConfigs: Record<string, [string, string[]]> = {
  "based-perps": ["Based", [CHAIN.BASE]],
  "befy-perps": ["Befi", [CHAIN.BASE]],
  "bmx-perps": ["BMX", [CHAIN.BASE, CHAIN.MODE]],
  "carbon-perps": ["Carbon", [CHAIN.BASE]],
  "cloverfield-perps": ["Cloverfield", [CHAIN.BASE, CHAIN.BSC]],
  "gryps-perps": ["Gryps", [CHAIN.ARBITRUM]],
  "intentx-perps": ["IntentX", [CHAIN.BASE, CHAIN.ARBITRUM, CHAIN.MANTLE]],
  "ivx-perps": ["IVX", [CHAIN.BERACHAIN]],
  "lode-perps": ["Lode", [CHAIN.BERACHAIN]],
  "pear-perps": ["Pear", [CHAIN.BASE, CHAIN.ARBITRUM]],
  "peppy-perps": ["Peppy", [CHAIN.BASE]],
  "privex-perps": ["Privex", [CHAIN.BASE]],
  "spooky-perps": ["Spooky", [CHAIN.SONIC]],
  "treble-perps": ["Treble", [CHAIN.BASE]],
  "vibe-perps": ["Vibe", [CHAIN.BASE, CHAIN.ARBITRUM]],
  "xpanse-perps": ["Xpanse", [CHAIN.BASE, CHAIN.MODE, CHAIN.ARBITRUM]],
  "zklink-perps": ["ZkLink", [CHAIN.BASE]],
};

const feesConfigs: Record<string, [string, string[]]> = {
  "thena-perp": ["Thena", [CHAIN.BSC]],
};

const dexsProtocols: Record<string, any> = {};
for (const [name, [affiliate, chains]] of Object.entries(dexsConfigs)) {
  dexsProtocols[name] = symmioAffiliateAdapter(affiliate, chains);
}

const feesProtocols: Record<string, any> = {};
for (const [name, [affiliate, chains]] of Object.entries(feesConfigs)) {
  feesProtocols[name] = symmioAffiliateAdapter(affiliate, chains);
}

export const { protocolList, getAdapter } = createFactoryExports(dexsProtocols);
export const fees = createFactoryExports(feesProtocols);
