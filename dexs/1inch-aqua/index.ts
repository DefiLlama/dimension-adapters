import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getAquaFills } from "../../helpers/oneinchAqua";

// Aqua registries (https://github.com/1inch/aqua), each deployed at the same
// address on every supported chain. The protocol redeployed on 2026-07-19 as
// AquaRouter with an unchanged event interface (source verified, e.g.
// https://robinhoodchain.blockscout.com/address/0x1111113CCf1426A8e30e2BFF5e005D929bf6A90A?tab=contract);
// the original developer-release registry is kept so earlier history stays reproducible.
const AQUA_REGISTRIES = [
  "0x499943e74fb0ce105688beee8ef2abec5d936d31", // developer release, 2025-11-17
  "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a", // AquaRouter, 2026-07-19
];

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  // Volume is the fee-inclusive side of each swap: the amount a taker pays
  // into the maker wallet, emitted as Pushed by the registry's push().
  // (Pulled, the taker-received side, is net of the maker fee and undercounts.)
  // Strategy-registration pushes are excluded, and a maker's strategies traded
  // against each other in one transaction net out (see helpers/oneinchAqua.ts):
  // makers farming the volume-based Merkl rewards (launched 2026-07-28) crossed
  // their own strategies, inflating Ethereum to $2.1B on 2026-10-06.
  const fills = await getAquaFills(options, AQUA_REGISTRIES);
  fills.forEach(({ token, netAmount }) => dailyVolume.add(token, netAmount));

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
    [CHAIN.MONAD, { start: "2026-09-09" }],
    [CHAIN.ARC, { start: "2026-09-02" }],
  ],
  start: "2025-11-17", // Aqua developer release: https://blog.1inch.com/aqua-developer-release/
  methodology: {
    Volume:
      "Sum of tokens paid into maker wallets during Aqua swap execution, measured as Pushed events on the Aqua registries (the current AquaRouter and the original developer-release registry). Only the taker-paid side of each swap is counted, to avoid double counting and to include the maker fee (the Pulled side is net of fees and would undercount). Pushed events emitted by strategy deployment (the consecutive run following a Shipped event for the same strategy) only register virtual balances without moving tokens and are excluded. When a maker's own strategies trade against each other within one transaction, the tokens the maker receives are netted against what it pays out of the same token, so only the net change counts.",
  },
};

export default adapter;
