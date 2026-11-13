import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTaxHook, KLEOS_BREAKDOWN, KLEOS_METHODOLOGY, kleosBalances } from "../../helpers/kleos";

// Kleos (https://thekleos.pro) v5: taxed coins launched against HYPE, $KLEOS, KNTQ, tokenized stocks, UETH and more, trading in
// Uniswap v4 pools on Uniswap's own PoolManager on Elysium, under KleosV5Hook. Their swaps are already counted by the uniswap-v4
// adapter (same PoolManager), hence doublecounted. Kleos's other venues: dexs/kleos.
// Addresses from the app's deployment record (https://github.com/aidaonsui-collab/flux,
// app/src/config/deployments/99901.json: `v5.poolManager` and `v5.hooks`).
const UNISWAP_POOL_MANAGER = "0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1";
// The first is the hook every coin so far launched on. The second is the next hook version (coins whose buyback share
// builds a price floor), deployed and due to take new launches from 2026-11-14: until then it has no trades to count.
const V5_HOOKS = ["0x0fa71294c909b11A0b805df4763Ba576c69c2acC", "0x1fe9C91651d42a74048dCfcfa63175F8A12eeAcC"];

async function fetch(options: FetchOptions) {
  const b = kleosBalances(options);
  for (const hook of V5_HOOKS) await addTaxHook(options, b, hook, UNISWAP_POOL_MANAGER, "v5");
  return { ...b, dailyUserFees: b.dailyFees.clone() };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-11-04",
  methodology: KLEOS_METHODOLOGY,
  breakdownMethodology: KLEOS_BREAKDOWN,
  doublecounted: true,
};

export default adapter;
