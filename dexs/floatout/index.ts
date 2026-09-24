import { getCreateAddress } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBuilderCodeRevenue } from "../../helpers/hyperliquid";
import fetchURL from "../../utils/fetchURL";

// Builder code of every free (house-mode) Floatout DEX, owned by Floatout, so 100% of its fees are Floatout revenue. https://floatout.xyz
const HOUSE_BUILDER = "0x8e31dfb0fb06b92a4b623c17e139fc9119484fc8";
// Pilot DEX BuilderLedger proxy, deployed by the retired pilot key 0x48c59a630dc50bf0d4b1635bf708078a95a9fb78
// in tx 0xbae8978dfe0830f74b621b44358669b19f53334642a3cf5cb70f37f0b9c21246 on HyperEVM. That key is retired, so this never changes.
const PILOT_LEDGER = "0xcf61b5ca383da9251473421178268c85f0a67e71";
// Floatout's activation deployer. Every other activated DEX gets its own BuilderLedger proxy deployed from this key with plain CREATE,
// so ledgers are discovered from its nonce. Only this key can create at those addresses. It also deploys TimelockControllers,
// which answer getMinDelay() instead of usdcCoreToken().
const ACTIVATION_DEPLOYER = "0xea253b461eba2083c7f1838b0beb9ab1ea9b7418";
// Floatout's accrued platform share of activated-DEX builder fees for one UTC day, from its append-only off-chain ledger
// (the per-DEX rate is not on chain). Published only once the day is reconciled against Hyperliquid's builder_fills and fully
// accrued, immutable afterwards. 404 until then, which throws.
const PLATFORM_SHARE_API = "https://floatout.xyz/api/public/defillama";

const FREE_FEES = "Builder Fees On Free DEXes";
const ACTIVATED_FEES = "Builder Fees On Activated DEXes";
const FREE_TO_FLOATOUT = "Free DEX Builder Fees To Floatout";
const SHARE_TO_FLOATOUT = "Activated DEX Platform Share To Floatout";
const ACTIVATED_TO_SUPPLY = "Activated DEX Fees To Tenants, Affiliates And Partners";

const getActivatedLedgers = async (options: FetchOptions) => {
  const nonce = await options.api.provider.getTransactionCount(ACTIVATION_DEPLOYER, await options.getToBlock());
  const calls = Array.from({ length: nonce }, (_, i) => getCreateAddress({ from: ACTIVATION_DEPLOYER, nonce: i }).toLowerCase());
  const usdcTokens = await options.api.multiCall({ abi: "function usdcCoreToken() view returns (uint64)", calls, permitFailure: true });
  const minDelays = await options.api.multiCall({ abi: "function getMinDelay() view returns (uint256)", calls, permitFailure: true });
  // Ledgers and timelocks both implement ERC165, a nonce that created no contract does not. Every contract must be a ledger
  // or a timelock, so a failed ledger call can never silently drop a ledger's fees.
  const erc165 = await options.api.multiCall({ abi: "function supportsInterface(bytes4) view returns (bool)", calls: calls.map((target) => ({ target, params: ["0x01ffc9a7"] })), permitFailure: true });
  const unclassified = calls.filter((_, i) => erc165[i] !== null && usdcTokens[i] === null && minDelays[i] === null);
  if (unclassified.length) throw new Error(`floatout: unclassified contracts from the activation deployer: ${unclassified.join(", ")}`);
  return [PILOT_LEDGER, ...calls.filter((_, i) => usdcTokens[i] !== null)];
};

const fetch = async (options: FetchOptions) => {
  const date = new Date(options.startOfDay * 1000).toISOString().slice(0, 10);
  const ledgers = await getActivatedLedgers(options);
  const share = await fetchURL(`${PLATFORM_SHARE_API}/${date}`);
  if (share.date !== date || !/^\d+(\.\d+)?$/.test(share.platformShareUsdc) || !Array.isArray(share.builders))
    throw new Error(`floatout: malformed platform share response for ${date}`);
  const platformShareUsdc = Number(share.platformShareUsdc);
  if (!Number.isFinite(platformShareUsdc)) throw new Error(`floatout: malformed platform share response for ${date}`);
  const unknown = share.builders.filter((b: string) => !ledgers.includes(String(b).toLowerCase()));
  if (unknown.length) throw new Error(`floatout: platform share builders not discovered on chain: ${unknown.join(", ")}`);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const freeFees = options.createBalances();
  const activatedFees = options.createBalances();
  for (const builder_address of [HOUSE_BUILDER, ...ledgers]) {
    const result = await fetchBuilderCodeRevenue({ options, builder_address });
    dailyVolume.addBalances(result.dailyVolume);
    (builder_address === HOUSE_BUILDER ? freeFees : activatedFees).addBalances(result.dailyFees);
  }
  dailyFees.addBalances(freeFees, FREE_FEES);
  dailyFees.addBalances(activatedFees, ACTIVATED_FEES);

  const platformShare = options.createBalances();
  platformShare.addCGToken("usd-coin", platformShareUsdc);

  const dailyRevenue = options.createBalances();
  dailyRevenue.addBalances(freeFees, FREE_TO_FLOATOUT);
  dailyRevenue.addBalances(platformShare, SHARE_TO_FLOATOUT);

  const dailySupplySideRevenue = activatedFees.clone(1, ACTIVATED_TO_SUPPLY);
  dailySupplySideRevenue.subtract(platformShare, ACTIVATED_TO_SUPPLY);

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue.clone(), dailySupplySideRevenue };
};

const methodology = {
  Volume: "Notional volume of Hyperliquid trades placed through Floatout DEXes, counted from the builder codes those DEXes use.",
  Fees: "Builder fees paid by traders on Floatout DEXes, on top of Hyperliquid's own trading fees.",
  Revenue: "All builder fees on free Floatout DEXes, plus Floatout's platform share of builder fees on activated DEXes.",
  ProtocolRevenue: "All builder fees on free Floatout DEXes, plus Floatout's platform share of builder fees on activated DEXes.",
  SupplySideRevenue: "Builder fees on activated DEXes minus Floatout's platform share, paid out to DEX owners, affiliates and partners.",
};

const breakdownMethodology = {
  Fees: {
    [FREE_FEES]: "Builder fees on free Floatout DEXes, which all use Floatout's house builder code.",
    [ACTIVATED_FEES]: "Builder fees on activated Floatout DEXes, each paid to that DEX's own BuilderLedger contract.",
  },
  Revenue: {
    [FREE_TO_FLOATOUT]: "Builder fees on free DEXes, all kept by Floatout.",
    [SHARE_TO_FLOATOUT]: "Floatout's platform share of builder fees on activated DEXes, as accrued in Floatout's ledger.",
  },
  ProtocolRevenue: {
    [FREE_TO_FLOATOUT]: "Builder fees on free DEXes, all kept by Floatout.",
    [SHARE_TO_FLOATOUT]: "Floatout's platform share of builder fees on activated DEXes, as accrued in Floatout's ledger.",
  },
  SupplySideRevenue: {
    [ACTIVATED_TO_SUPPLY]: "Builder fees on activated DEXes left after Floatout's platform share, claimable from the BuilderLedger by the DEX owner, its affiliates and partners.",
  },
};

const adapter: SimpleAdapter = {
  version: 1, // Hyperliquid builder fills and Floatout's platform share are both daily aggregates
  doublecounted: true, // builder code volume is already counted in Hyperliquid
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: "2026-08-28",
  methodology,
  breakdownMethodology,
};

export default adapter;
