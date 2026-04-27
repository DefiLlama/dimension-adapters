import { CHAIN } from "../helpers/chains";
import { subscanFeeAdapter } from "../helpers/subscanFees";
import { createFactoryExports } from "./registry";

const protocolChainMap: Record<string, string> = {
    "polkadot": CHAIN.POLKADOT,
    "pendulum": CHAIN.PENDULUM,
    "peaq": CHAIN.PEAQ,
    "neuroweb": CHAIN.NEUROWEB,
    "mythos": CHAIN.MYTHOS,
    "moonbeam": CHAIN.MOONBEAM,
    "heima": CHAIN.HEIMA,
    "karura": CHAIN.KARURA,
    "kusama": CHAIN.KUSAMA,
    "hydration-chain": CHAIN.HYDRADX,
    "robonomics": CHAIN.ROBONOMICS,
    "darwinia": CHAIN.DARWINIA,
}

const feesProtocols: Record<string, any> = {};
for (const [name, chain] of Object.entries(protocolChainMap)) {
    feesProtocols[name] = subscanFeeAdapter(chain)
}

export const { protocolList, getAdapter } = createFactoryExports(feesProtocols)