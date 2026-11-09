import { CHAIN } from "../helpers/chains";
import { subscanFeeAdapter } from "../helpers/subscanFees";
import { createFactoryExports } from "./registry";

const protocolChainMap: Record<string, string> = {
    "polkadot": CHAIN.POLKADOT,
    // "pendulum": CHAIN.PENDULUM, // network dropped from subscan (api returns 404, checked 2026-11-08); no RPC replacement: user extrinsics stopped with the DIA oracle feeder at block 7,329,373 (2026-06-26), and fees go to the treasury pot (py/trsry), which also pays out spends, so its balance can't isolate fees (inflow since then ~0.1 PEN/day)
    "peaq": CHAIN.PEAQ,
    // "neuroweb": CHAIN.NEUROWEB, // network dropped from subscan (api returns 404, checked 2026-11-08); no RPC replacement: public nodes keep state for ~256 blocks and EVM blocks for ~1000, and the chain had no user extrinsics in the 600 blocks checked
    "mythos": CHAIN.MYTHOS,
    "moonbeam": CHAIN.MOONBEAM,
    // "heima": CHAIN.HEIMA, // network dropped from subscan (heima.api.subscan.io + heima.subscan.io return 404, checked 2026-11-08); heima now runs a self-hosted subscan-essentials explorer with no daily fee endpoint
    // "karura": CHAIN.KARURA, moved to fees/karura.ts: network dropped from subscan (api returns 404, checked 2026-11-08), fees now come from the treasury reserve balance over RPC
    "kusama": CHAIN.KUSAMA,
    // "hydration-chain": CHAIN.HYDRADX, moved to fees/hydration-chain.ts: network dropped from subscan (api returns 404, checked 2026-11-08), fees now come from Hydration's explorer indexer
    // "robonomics": CHAIN.ROBONOMICS, moved to fees/robonomics.ts: network dropped from subscan (api returns 404, checked 2026-11-08), fees now come from the collator staking pot balance over RPC
    "darwinia": CHAIN.DARWINIA,
}

const feesProtocols: Record<string, any> = {};
for (const [name, chain] of Object.entries(protocolChainMap)) {
    feesProtocols[name] = subscanFeeAdapter(chain)
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols)