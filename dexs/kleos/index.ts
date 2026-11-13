import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addKleosSwap, addTaxHook, KLEOS_BREAKDOWN, KLEOS_METHODOLOGY, kleosBalances } from "../../helpers/kleos";

// Kleos (https://thekleos.pro) on its own venues, which no other adapter counts:
// - KleosSwap, Kleos's Uniswap v3-style DEX, where classic launches trade (two launchpad versions)
// - Kleos's own Uniswap v4 PoolManager, where its v4 launches (KleosTaxHook), $KLEOS-paired launches (KleosPairHook) and its
//   first v5 set (KleosV5Hook) trade.
// Kleos's current v5 coins trade on Uniswap's own v4 PoolManager on Elysium: see dexs/kleos-v5. Addresses from the app's
// deployment record (https://github.com/aidaonsui-collab/flux, app/src/config/deployments/99901.json).
const KLEOSSWAP_FACTORY = "0x809ff79945FfFbf9B8Df33Bb3B62872CEB2efaF1";
// KleosSwap's position manager (launch positions) and the platform wallet, which receives the 10% LP fee share.
const KLEOSSWAP_POSITION_MANAGER = "0x59c3630B078D2c561AB69c990987C9F13E90eD37";
const KLEOS_TREASURY = "0x4116CCc1cc2B34953F73413C4747c954F49C179b";
const KLEOS_WHYPE = "0x0269031ace34a7821e9D9980d087c35cE7c19EEF"; // Kleos's wrapped HYPE, which KleosSwap pools are quoted in
const LAUNCHPADS = ["0x6E3AFDdc49f5D43858a1FDD48184426deD11029b", "0x7700Cb672BbD853CF57e82Ea14C3ebBaAc3ec470"];
const KLEOS_POOL_MANAGER = "0xb308B5df891c300a5f5a5b8fdBC30108bA842490";
const V4_TAX_HOOK = "0x0c835e6A51717a514144d95c7F0a1C640179E0Cc";
const PAIR_HOOK = "0x772AccB053609D361593345e361D2a6854Ede8cc"; // $KLEOS-paired launches
const V5_FIRST_HOOK = "0xD5068e7f4e2D70d5eFbaC6fD28A8407252E1EAcC";

async function fetch(options: FetchOptions) {
  const b = kleosBalances(options);
  await addKleosSwap(options, b, { factory: KLEOSSWAP_FACTORY, fromBlock: 7700, whype: KLEOS_WHYPE, launchpads: LAUNCHPADS, positionManager: KLEOSSWAP_POSITION_MANAGER, treasury: KLEOS_TREASURY });
  await addTaxHook(options, b, V4_TAX_HOOK, KLEOS_POOL_MANAGER, "v4");
  await addTaxHook(options, b, PAIR_HOOK, KLEOS_POOL_MANAGER, "pair");
  await addTaxHook(options, b, V5_FIRST_HOOK, KLEOS_POOL_MANAGER, "v5");
  return { ...b, dailyUserFees: b.dailyFees.clone() };
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ELYSIUM],
  start: "2026-10-25",
  methodology: KLEOS_METHODOLOGY,
  breakdownMethodology: KLEOS_BREAKDOWN,
};

export default adapter;
