import { CHAIN } from "../helpers/chains";
import { RouteScanFeeConfig, routescanFeeAdapter } from "../helpers/routescanFees";
import { createFactoryExports } from "./registry";

const routescanFeeChains: Record<string, RouteScanFeeConfig> = {
  dfk: { chain: CHAIN.DFK, chainId: 53935, CGToken: "defi-kingdoms", start: "2022-03-16" },
  dexalot: { chain: CHAIN.DEXALOT, chainId: 432204, CGToken: "dexalot", start: "2022-12-04" },
  step: { chain: CHAIN.STEP, chainId: 1234, CGToken: "step-app-fitfi", start: "2022-08-12" },
  nibiru: { chain: CHAIN.NIBIRU, chainId: 6900, CGToken: "nibiru", start: "2025-02-11" },
  botanix: { chain: CHAIN.BOTANIX, chainId: 3637, CGToken: "bitcoin", start: "2025-05-22" },
};

const protocols: Record<string, any> = {};
for (const [name, config] of Object.entries(routescanFeeChains)) {
  protocols[name] = routescanFeeAdapter(config);
}

export const { protocolList, getAdapter } = createFactoryExports(protocols);
