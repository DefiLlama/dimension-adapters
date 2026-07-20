import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

// Aqua registries (https://github.com/1inch/aqua), each deployed at the same
// address on every supported chain. The protocol redeployed on 2026-07-19 as
// AquaRouter with an unchanged event interface (source verified, e.g.
// https://robinhoodchain.blockscout.com/address/0x1111113CCf1426A8e30e2BFF5e005D929bf6A90A?tab=contract);
// the original developer-release registry is kept so earlier history stays reproducible.
const AQUA_REGISTRIES = [
  "0x499943e74fb0ce105688beee8ef2abec5d936d31", // developer release, 2025-11-17
  "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a", // AquaRouter, 2026-07-19
];

const PULLED_ABI =
  "event Pulled(address maker, address app, bytes32 strategyHash, address token, uint256 amount)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Pulled fires only when a strategy delivers tokens to a taker during swap
  // execution. Strategy lifecycle operations (ship/dock) move no tokens and
  // never emit Pulled, so all Pulled events count toward volume.
  const pulledLogs = await options.getLogs({
    targets: AQUA_REGISTRIES,
    eventAbi: PULLED_ABI,
  });
  pulledLogs.forEach((log: any) => dailyVolume.add(log.token, log.amount));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [
    CHAIN.ETHEREUM,
    CHAIN.BASE,
    CHAIN.OPTIMISM,
    CHAIN.POLYGON,
    CHAIN.ARBITRUM,
    CHAIN.AVAX,
    CHAIN.BSC,
    CHAIN.XDAI,
    CHAIN.LINEA,
    CHAIN.SONIC,
    CHAIN.UNICHAIN,
    CHAIN.ERA,
    [CHAIN.ROBINHOOD, { start: "2026-07-19" }],
  ],
  start: "2025-11-17", // Aqua developer release: https://blog.1inch.com/aqua-developer-release/
  methodology: {
    Volume:
      "Sum of tokens delivered to takers by Aqua strategies during swap execution, measured as Pulled events on the Aqua registries (the current AquaRouter and the original developer-release registry). Only the taker-received side of each swap is counted to avoid double counting. Strategy deploy/close operations (Shipped/Docked) move no tokens and emit no Pulled events, so liquidity lifecycle operations add no volume.",
  },
};

export default adapter;
