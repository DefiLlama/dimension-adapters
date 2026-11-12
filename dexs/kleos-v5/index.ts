import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTaxHook, KLEOS_BREAKDOWN, KLEOS_METHODOLOGY, kleosBalances } from "../../helpers/kleos";

// Kleos (https://thekleos.pro) v5: taxed coins launched against HYPE, $KLEOS, KNTQ, tokenized stocks, UETH and more, trading in
// Uniswap v4 pools on Uniswap's own PoolManager on Elysium, under KleosV5Hook. Their swaps are already counted by the uniswap-v4
// adapter (same PoolManager), hence doublecounted. Kleos's other venues: dexs/kleos.
const UNISWAP_POOL_MANAGER = "0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1";
const V5_HOOK = "0x0fa71294c909b11A0b805df4763Ba576c69c2acC";

async function fetch(options: FetchOptions) {
  const b = kleosBalances(options);
  await addTaxHook(options, b, V5_HOOK, UNISWAP_POOL_MANAGER, "v5");
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
