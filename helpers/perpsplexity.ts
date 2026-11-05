// Perpsplexity (Sui): leveraged meme pools and leveraged tokens backed by perpetual positions on Aftermath.
// Shared by dexs/perpsplexity and fees/perpsplexity. Sources: the protocol's Move packages on Sui mainnet.
import * as sdk from "@defillama/sdk";
import { FetchOptions } from "../adapters/types";
import { queryEvents } from "./sui";

export type Deployment = {
  version: string;
  // "core1": pools (composite_pool::CompositePool and pool::Pool); "lev": leveraged tokens (token::LevToken)
  kind: "core1" | "lev";
  // first publish of the package line: event and object types always carry it, upgrades included
  original: string;
  // shared Config object of the line (fee split and fee rates are read from it)
  config: string;
  // core1 only: the Launchpad object, whose platform_fees::Accrued events are launch fees
  launchpad?: string;
  start: string;
};

// One entry per deployed package line; a new generation (for example the v2 pools) is one more entry.
// Package and config ids: https://perpsplexity.app/docs (Security page).
export const DEPLOYMENTS: Deployment[] = [
  {
    version: "v1-immutable",
    kind: "core1",
    original: "0xaedb8c9a905a778e831aeb4928f660210a7a645925348a7c4ec1cb4a6a3fd16e",
    config: "0xb57be7c2f90d8bf9232af4cb967b411861b713f4480dfe50871dc85579f98411",
    launchpad: "0x111ee5ba1e2fc185ddb6628ff885151773f35a7a73246132099bade148edb3cc",
    start: "2026-09-16",
  },
  {
    version: "v1",
    kind: "core1",
    original: "0x97fea95545c04dc73f8174c6195013b100a26e3fa978e7cf8b100a51dfaf8354",
    config: "0x7566f0f6508b7797f906c78ae5a39aaf1cd5aec58ff765b2599a6fba1dfce12c",
    launchpad: "0x6131090639b7c4a5af741ae1163e480f0b2cf50e74823d7c2261b5a3a3d5a586",
    start: "2026-09-17",
  },
  {
    version: "lev",
    kind: "lev",
    original: "0x294e0968e465d9e2e560b825c603a40d34a7ee72e5a9157ff796519d44f7df4a",
    config: "0xfa003af67a3c948d1ebf9bbde1b08da54bee838d92ce577046fbc8fdc7d15cb4",
    start: "2026-10-02",
  },
];

export const START = "2026-09-16";

const ZERO = "0x" + "0".repeat(64);
const normalize = (id: string) => "0x" + id.replace(/^0x/, "").toLowerCase().padStart(64, "0");

/** Quote coin type of each pool or token: the last type argument of its object type (CompositePool<M, P, Q>, Pool<M, Q>, LevToken<T, Q>). */
async function quoteTypes(ids: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(ids.map(normalize))];
  if (!unique.length) return {};
  const objects = await sdk.chains.sui.getObjects({ objectIds: unique, skipLayout: true });
  const out: Record<string, string> = {};
  objects.forEach((o, i) => {
    if (!o?.type) throw new Error(`Perpsplexity object ${unique[i]} not found`);
    const args = sdk.chains.sui.parseStructTag(o.type).typeParams;
    out[unique[i]] = args[args.length - 1];
  });
  return out;
}

export type PoolTrade = {
  deployment: Deployment;
  pool: string;
  quote: string;
  buy: boolean;
  // quote units the trader put in (buy) or the sale grossed before its fee (sell)
  volume: bigint;
  fee: bigint;
};

/** Every buy and sell on Perpsplexity pools in the window, from composite_pool::Swap and pool::Swap. */
export async function poolTrades(options: FetchOptions): Promise<PoolTrade[]> {
  const raw: { deployment: Deployment; e: any }[] = [];
  for (const deployment of DEPLOYMENTS.filter((d) => d.kind === "core1")) {
    for (const module of ["composite_pool", "pool"]) {
      const events = await queryEvents({ eventType: `${deployment.original}::${module}::Swap`, options });
      events.forEach((e) => raw.push({ deployment, e }));
    }
  }
  const quotes = await quoteTypes(raw.map((r) => r.e.pool));
  return raw.map(({ deployment, e }) => {
    const fee = BigInt(e.fee);
    // a buy's input is what the trader paid, fee included; a sale's output is net of its fee
    const volume = e.buy ? BigInt(e.input) : BigInt(e.output) + fee;
    return { deployment, pool: normalize(e.pool), quote: quotes[normalize(e.pool)], buy: !!e.buy, volume, fee };
  });
}

/** Launch fees (paid in SUI to the launchpad) in the window, from platform_fees::Accrued on each Launchpad. */
export async function launchFees(options: FetchOptions): Promise<{ coin: string; amount: bigint }[]> {
  const out: { coin: string; amount: bigint }[] = [];
  for (const deployment of DEPLOYMENTS.filter((d) => d.kind === "core1" && d.launchpad)) {
    const events = await queryEvents({ eventType: `${deployment.original}::platform_fees::Accrued`, options });
    for (const e of events) {
      if (normalize(e.pool) !== normalize(deployment.launchpad!)) continue;
      out.push({ coin: "0x" + String(e.quote_type?.name ?? e.quote_type).replace(/^0x/, ""), amount: BigInt(e.amount) });
    }
  }
  return out;
}

export type LevFlow = {
  deployment: Deployment;
  token: string;
  quote: string;
  kind: "mint" | "redeem" | "streaming";
  // quote units deposited (mint, fee included) or paid out (redeem, after fee); 0 for streaming fees
  amount: bigint;
  fee: bigint;
  // fee share sent to the trader's referrer
  referral: bigint;
};

/** Leveraged token mints, redemptions and streaming fee collections in the window. */
export async function levFlows(options: FetchOptions): Promise<LevFlow[]> {
  const raw: { deployment: Deployment; kind: LevFlow["kind"]; e: any; referralBps: bigint }[] = [];
  for (const deployment of DEPLOYMENTS.filter((d) => d.kind === "lev")) {
    // token::pay_fee sends referral_bps of a mint/redeem fee to the trader's referrer (when one is set), the rest to the protocol
    const config = await sdk.chains.sui.getObject({ objectId: deployment.config, skipLayout: true });
    const referralBps = BigInt(config?.fields?.settings?.fields?.referral_bps ?? config?.fields?.settings?.referral_bps);
    for (const [name, kind] of [["Minted", "mint"], ["Redeemed", "redeem"], ["FeesCollected", "streaming"]] as const) {
      const events = await queryEvents({ eventType: `${deployment.original}::token::${name}`, options });
      events.forEach((e) => raw.push({ deployment, kind, e, referralBps }));
    }
  }
  const quotes = await quoteTypes(raw.map((r) => r.e.token));
  return raw.map(({ deployment, kind, e, referralBps }) => {
    const fee = BigInt(kind === "streaming" ? e.payout : e.fee);
    const referred = kind !== "streaming" && normalize(String(e.referrer)) !== ZERO;
    const referral = referred ? (fee * referralBps) / 10000n : 0n;
    const amount = kind === "mint" ? BigInt(e.deposit) + fee : kind === "redeem" ? BigInt(e.payout) : 0n;
    return { deployment, token: normalize(e.token), quote: quotes[normalize(e.token)], kind, amount, fee, referral };
  });
}

/** Fee split of a pool config: treasury_bps, dividend_bps (creator 10% carved out of it) and platform_bps. */
export async function poolSplits(): Promise<Record<string, { treasury: bigint; dividend: bigint }>> {
  const out: Record<string, { treasury: bigint; dividend: bigint }> = {};
  for (const d of DEPLOYMENTS.filter((d) => d.kind === "core1")) {
    const config = await sdk.chains.sui.getObject({ objectId: d.config, skipLayout: true });
    const params = config?.fields?.params?.fields ?? config?.fields?.params;
    if (params?.treasury_bps == null || params?.dividend_bps == null) throw new Error(`Perpsplexity config ${d.config} unreadable`);
    out[d.original] = { treasury: BigInt(params.treasury_bps), dividend: BigInt(params.dividend_bps) };
  }
  return out;
}
