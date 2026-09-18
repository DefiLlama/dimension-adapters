import { ChainApi } from "@defillama/sdk";
import PromisePool from "@supercharge/promise-pool";
import { FetchOptions } from "../../adapters/types";
import { getConfig } from "../../helpers/cache";
import { getBlock } from "../../helpers/getBlock";
import { ProtocolRevenueFeeMint, RatePoint, VaultDecimals, exchangeRate } from "./accounting";
import { CHAIN_CONFIG, CONCRETE_API, MIN_PEAK_TVL_USD, RateSource, VAULT_OVERRIDES, UNDERLYING_ASSET_CONVERSIONS } from "./config";

const ABI = {
  asset: 'address:asset',
  decimals: 'uint8:decimals',
  totalSupply: 'uint256:totalSupply',
  totalAssets: 'uint256:totalAssets',
  cachedTotalAssets: 'uint256:cachedTotalAssets',
  feeRecipient: 'address:feeRecipient',
  strategies: 'function getStrategies() view returns (address[])',
  multisig: 'address:getMultiSig',
  transfer: 'event Transfer(address indexed from, address indexed to, uint256 value)',
  managementFeeAccrued: 'event ManagementFeeAccrued(address indexed recipient, uint256 shares, uint256 feeAmount)',
  performanceFeeAccrued: 'event PerformanceFeeAccrued(address indexed recipient, uint256 shares, uint256 feeAmount)',
  unbackedMint: 'event UnbackedMint(uint256 shares)',
};

// ERC-20 mints come from and burns go to the zero address; it also stands in for "no address" in multicalls.
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Blocks read at once; each block is a handful of batched archive calls, kept modest for public RPCs. */
const BLOCK_READ_CONCURRENCY = 5;

export type Vault = VaultDecimals & {
  address: string;
  version: 1 | 2;
  /** Balances key the yield is priced in. */
  base: string;
  /** Converts an amount of the underlying asset to `base`, when the two differ. */
  rateSource?: RateSource;
  /** The asset is another Concrete vault (a staked vault); converted to `base` at that vault's window-end exchange rate. */
  stakedIn?: VaultDecimals & { address: string; rateSource?: RateSource };
  /** Operator wallets whose mints and burns are bookkeeping, not deposits or redemptions. */
  admins: Set<string>;
  /** V1 only: where protocol fee shares are minted to. V2 announces its fee mints with events. */
  feeRecipients: Set<string>;
  /** Unix time from which the vault is worthless; undefined when it never is. */
  valuelessSince?: number;
};

export type SupplyEvents = { breakpoints: Set<number>; adminBlocks: Set<number>; feeMints: ProtocolRevenueFeeMint[] };

const toUnix = (iso: string) => Math.floor(new Date(iso).getTime() / 1e3);
const lower = (address: string) => address.toLowerCase();

/** The vaults worth measuring in this window, from Concrete's registry plus their on-chain asset and decimals. */
export async function trackedVaults(options: FetchOptions): Promise<Vault[]> {
  const { chainId } = CHAIN_CONFIG[options.chain];
  const registry = await getConfig('concrete/vaults', `${CONCRETE_API}/vault:tvl/all`);
  const listed: any[] = Object.values(registry[chainId] ?? {});
  const concreteVaults = new Set(listed.map((v) => lower(v.address)));

  const candidates = listed
    .filter((v) => (v.version === 1 || v.version === 2) && Number(v.peak_tvl) > MIN_PEAK_TVL_USD)
    .map((v) => ({ address: lower(v.address), version: v.version as 1 | 2, ...VAULT_OVERRIDES[`${options.chain}:${lower(v.address)}`] }))
    // Nothing left to measure once the assets are gone.
    .filter((v) => v.valuelessSince === undefined || toUnix(v.valuelessSince) > options.fromTimestamp);
  const addresses = candidates.map((v) => v.address);

  // A vault deployed after the window has no code yet: `permitFailure` leaves it out.
  const assets: (string | null)[] = await options.api.multiCall({ abi: ABI.asset, calls: addresses, permitFailure: true });
  const decimals: (string | null)[] = await options.api.multiCall({ abi: ABI.decimals, calls: addresses, permitFailure: true });
  const assetDecimals: (string | null)[] = await options.api.multiCall({ abi: ABI.decimals, calls: assets.map((a) => a ?? ZERO_ADDRESS), permitFailure: true });
  // A staked vault's asset is another Concrete vault; that one's own asset decides the priced token.
  const stakedIn = assets.map((a) => (a && concreteVaults.has(lower(a)) ? lower(a) : null));
  const stakedAssets: (string | null)[] = await options.api.multiCall({ abi: ABI.asset, calls: stakedIn.map((a) => a ?? ZERO_ADDRESS), permitFailure: true });
  const stakedAssetDecimals: (string | null)[] = await options.api.multiCall({ abi: ABI.decimals, calls: stakedAssets.map((a) => a ?? ZERO_ADDRESS), permitFailure: true });

  const v1 = candidates.filter((v) => v.version === 1).map((v) => v.address);
  // The recipient can be rotated; accept whoever was configured at either end of the window.
  const recipientsAtStart: (string | null)[] = await options.fromApi.multiCall({ abi: ABI.feeRecipient, calls: v1, permitFailure: true });
  const recipientsAtEnd: (string | null)[] = await options.toApi.multiCall({ abi: ABI.feeRecipient, calls: v1, permitFailure: true });
  const feeRecipients = new Map<string, Set<string>>();
  v1.forEach((address, i) => {
    feeRecipients.set(address, new Set([recipientsAtStart[i], recipientsAtEnd[i]].filter(Boolean).map((r) => lower(r!))));
  });

  const vaults: Vault[] = [];
  candidates.forEach((candidate, i) => {
    if (!assets[i]) return;
    const asset = lower(assets[i]!);
    const child = stakedIn[i];
    // A vault with code answers all of these; a gap is an RPC problem, not a vault to skip.
    const incomplete = decimals[i] === null || assetDecimals[i] === null || (child && (stakedAssets[i] === null || stakedAssetDecimals[i] === null));
    if (incomplete) throw new Error(`incomplete metadata for vault ${candidate.address} on ${options.chain}`);
    const pricedAsset = child ? lower(stakedAssets[i]!) : asset;
    const rateSource = UNDERLYING_ASSET_CONVERSIONS[`${options.chain}:${pricedAsset}`];
    vaults.push({
      address: candidate.address,
      version: candidate.version,
      decimals: Number(decimals[i]),
      assetDecimals: Number(assetDecimals[i]),
      base: rateSource?.base ?? `${options.chain}:${pricedAsset}`,
      rateSource: child ? undefined : rateSource,
      stakedIn: child ? { address: child, decimals: Number(assetDecimals[i]), assetDecimals: Number(stakedAssetDecimals[i]), rateSource } : undefined,
      admins: new Set((candidate.admins ?? []).map(lower)),
      feeRecipients: feeRecipients.get(candidate.address) ?? new Set(),
      valuelessSince: candidate.valuelessSince === undefined ? undefined : toUnix(candidate.valuelessSince),
    });
  });
  return vaults;
}

/** Every block in which a vault's share supply changed, and what changed it. */
export async function supplyEvents(options: FetchOptions, vaults: Vault[]): Promise<Map<string, SupplyEvents>> {
  const events = new Map<string, SupplyEvents>(
    vaults.map((v) => [v.address, { breakpoints: new Set(), adminBlocks: new Set(), feeMints: [] }]),
  );
  const byAddress = new Map(vaults.map((v) => [v.address, v]));
  const eventsOf = (log: any) => events.get(lower(log.address))!;
  const logsOf = async (targets: string[], eventAbi: string): Promise<any[]> =>
    targets.length ? options.getLogs({ targets, eventAbi, entireLog: true }) : [];

  const transfers = await logsOf(vaults.map((v) => v.address), ABI.transfer);
  for (const log of transfers) {
    const { from, to, value } = log.args;
    const isMint = lower(from) === ZERO_ADDRESS;
    const isBurn = lower(to) === ZERO_ADDRESS;
    if (!isMint && !isBurn) continue; // wallet-to-wallet transfers leave supply alone
    const vault = byAddress.get(lower(log.address))!;
    const block = Number(log.blockNumber);
    eventsOf(log).breakpoints.add(block);
    const counterparty = lower(isMint ? to : from);
    if (vault.admins.has(counterparty)) {
      eventsOf(log).adminBlocks.add(block);
    } else if (isMint && vault.version === 1 && vault.feeRecipients.has(counterparty)) {
      // V1 mints its accrued protocol and performance fees together, on the next user
      // transaction or harvest; the two are not separable on-chain.
      eventsOf(log).feeMints.push({ block, shares: BigInt(value), kind: 'management' });
    }
  }

  const v2 = vaults.filter((v) => v.version === 2).map((v) => v.address);
  const multisigs = await strategyMultisigs(options, v2);
  for (const log of await logsOf(v2, ABI.managementFeeAccrued)) {
    eventsOf(log).feeMints.push({ block: Number(log.blockNumber), shares: BigInt(log.args.shares), kind: 'management' });
  }
  for (const log of await logsOf(v2, ABI.performanceFeeAccrued)) {
    // A performance fee paid to one of Concrete's own strategy multisigs funnels the gain into the
    // vault that strategy belongs to (a staked vault): it is that vault's growth, not revenue.
    if (multisigs.has(lower(log.args.recipient))) continue;
    eventsOf(log).feeMints.push({ block: Number(log.blockNumber), shares: BigInt(log.args.shares), kind: 'performance' });
  }
  // Bridged V2 vaults announce operator share issuance themselves (a migration target minting
  // the origin's entitlement), so those need no configured admin address.
  for (const log of await logsOf(v2, ABI.unbackedMint)) {
    eventsOf(log).adminBlocks.add(Number(log.blockNumber));
  }
  return events;
}

/** The multisig wallets behind the V2 vaults' strategies on this chain, at the window end. */
async function strategyMultisigs(options: FetchOptions, v2: string[]): Promise<Set<string>> {
  const strategies: (string[] | null)[] = await options.api.multiCall({ abi: ABI.strategies, calls: v2, permitFailure: true });
  const calls = strategies.flatMap((s) => s ?? []);
  // Only multisig strategies answer; the others (Morpho, Makina, ...) revert and are skipped.
  const multisigs: (string | null)[] = await options.api.multiCall({ abi: ABI.multisig, calls, permitFailure: true });
  return new Set(multisigs.filter(Boolean).map((m) => lower(m!)));
}

/** The rate points `integrate` runs over: both window boundaries and every supply change. */
export async function readRatePoints(
  options: FetchOptions,
  vaults: Vault[],
  events: Map<string, SupplyEvents>,
): Promise<Map<string, RatePoint[]>> {
  const [fromBlock, toBlock] = await Promise.all([options.getFromBlock(), options.getToBlock()]);
  const cutoffs = await valuelessCutoffBlocks(options, vaults);
  const stakedConversions = await stakedVaultConversions(options, vaults, toBlock);

  const wanted = new Map<number, Vault[]>();
  const want = (block: number, vault: Vault) => wanted.set(block, [...(wanted.get(block) ?? []), vault]);
  for (const vault of vaults) {
    const { breakpoints, adminBlocks } = events.get(vault.address)!;
    for (const block of [fromBlock, toBlock, ...breakpoints]) want(block, vault);
    // The block before an operator's block is a point too, so the accrual up to it is kept.
    for (const block of adminBlocks) if (block > fromBlock) want(block - 1, vault);
    // Likewise the last block before the vault turned valueless.
    const cutoff = cutoffs.get(vault.address);
    if (cutoff !== undefined && cutoff > fromBlock) want(cutoff, vault);
  }

  const points = new Map<string, RatePoint[]>(vaults.map((v) => [v.address, []]));
  const { errors } = await PromisePool.withConcurrency(BLOCK_READ_CONCURRENCY)
    .for([...wanted])
    .process(async ([block, blockVaults]) => {
      for (const { vault, point } of await readBlock(options, block, blockVaults, block === fromBlock, cutoffs, stakedConversions, events)) {
        points.get(vault)!.push(point);
      }
    });
  if (errors.length) throw errors[0];
  return points;
}

/** The last block at or before each vault's valueless cutoff, for cutoffs inside the window. */
async function valuelessCutoffBlocks(options: FetchOptions, vaults: Vault[]): Promise<Map<string, number>> {
  const cutoffs = new Map<string, number>();
  for (const vault of vaults) {
    if (vault.valuelessSince === undefined || vault.valuelessSince > options.toTimestamp) continue;
    const block = await getBlock(vault.valuelessSince, options.chain);
    if (!block) throw new Error(`no block for ${options.chain} at ${vault.valuelessSince}`);
    cutoffs.set(vault.address, block);
  }
  return cutoffs;
}

/**
 * A staked vault's asset is the underlying vault's shares, converted at that vault's exchange rate
 * at the window end and held fixed across the window: the staked vault earns its own rate growth
 * here, while the underlying vault's growth is counted at the underlying vault.
 */
async function stakedVaultConversions(options: FetchOptions, vaults: Vault[], toBlock: number): Promise<Map<string, (amount: bigint) => Promise<bigint>>> {
  const conversions = new Map<string, (amount: bigint) => Promise<bigint>>();
  const staked = vaults.filter((v) => v.stakedIn);
  if (!staked.length) return conversions;
  const api = new ChainApi({ chain: options.chain, block: toBlock });
  const underlyings = staked.map((v) => v.stakedIn!.address);
  const supplies: string[] = await api.multiCall({ abi: ABI.totalSupply, calls: underlyings });
  const assets = await totalAssetsAt(api, underlyings);
  staked.forEach((vault, i) => {
    const underlying = vault.stakedIn!;
    const rate = exchangeRate({ block: toBlock, totalSupply: BigInt(supplies[i]), totalAssets: assets[i], adminSupplyChange: false }, underlying);
    conversions.set(vault.address, async (shares) => {
      const assets = (shares * rate) / 10n ** BigInt(underlying.decimals);
      return underlying.rateSource ? (await convertAt(underlying.rateSource, api, toBlock, [assets]))[0] : assets;
    });
  });
  return conversions;
}

/** Vault state at the end of `block` for every vault that has a point there. */
async function readBlock(
  options: FetchOptions,
  block: number,
  vaults: Vault[],
  isWindowStart: boolean,
  cutoffs: Map<string, number>,
  stakedConversions: Map<string, (amount: bigint) => Promise<bigint>>,
  events: Map<string, SupplyEvents>,
): Promise<{ vault: string; point: RatePoint }[]> {
  const api = new ChainApi({ chain: options.chain, block });
  const supplies: (string | null)[] = await api.multiCall({ abi: ABI.totalSupply, calls: vaults.map((v) => v.address), permitFailure: true });
  const present = vaults.filter((vault, i) => {
    if (supplies[i] !== null) return true;
    if (isWindowStart) return false; // deployed inside the window
    throw new Error(`totalSupply of ${vault.address} failed at ${options.chain} block ${block}`);
  });
  const assets = await totalAssetsAt(api, present.map((v) => v.address));

  // Assets are read in the token the yield is priced in: valueless vaults are zero, the others
  // go through their asset's conversion (batched per source) and the staked vault's conversion.
  const valued = present.map((vault, i) => {
    const cutoff = cutoffs.get(vault.address);
    return cutoff !== undefined && block > cutoff ? 0n : assets[i];
  });
  const bySource = new Map<RateSource, number[]>();
  present.forEach((vault, i) => {
    if (vault.rateSource && valued[i] > 0n) bySource.set(vault.rateSource, [...(bySource.get(vault.rateSource) ?? []), i]);
  });
  for (const [source, indices] of bySource) {
    const converted = await convertAt(source, api, block, indices.map((i) => valued[i]));
    indices.forEach((i, j) => { valued[i] = converted[j]; });
  }
  for (const [i, vault] of present.entries()) {
    if (vault.stakedIn && valued[i] > 0n) valued[i] = await stakedConversions.get(vault.address)!(valued[i]);
  }

  return present.map((vault, i) => ({
    vault: vault.address,
    point: {
      block,
      totalSupply: BigInt(supplies[vaults.indexOf(vault)]!),
      totalAssets: valued[i],
      adminSupplyChange: events.get(vault.address)!.adminBlocks.has(block),
    },
  }));
}

/**
 * The vaults' total assets at the api's block, batched. V2's `totalAssets` reverts while its
 * accounting is stale or the vault is paused; `cachedTotalAssets` is the last valuation the vault
 * accepted. V1 has neither the revert nor the cache, so a failure there propagates.
 */
async function totalAssetsAt(api: ChainApi, vaults: string[]): Promise<bigint[]> {
  const live: (string | null)[] = await api.multiCall({ abi: ABI.totalAssets, calls: vaults, permitFailure: true });
  const stale = vaults.filter((_, i) => live[i] === null);
  const cached: string[] = await api.multiCall({ abi: ABI.cachedTotalAssets, calls: stale });
  return vaults.map((vault, i) => BigInt(live[i] ?? cached[stale.indexOf(vault)]));
}

/** `amounts` of the asset in its base token at `block`; a bridged token's source is read on its home chain at the same instant. */
async function convertAt(source: RateSource, api: ChainApi, block: number, amounts: bigint[]): Promise<bigint[]> {
  let sourceApi = api;
  if (source.chain !== api.chain) {
    const { timestamp } = (await api.provider.getBlock(block))!;
    const homeBlock = await getBlock(timestamp, source.chain);
    if (!homeBlock) throw new Error(`no block for ${source.chain} at ${timestamp}`);
    sourceApi = new ChainApi({ chain: source.chain, block: homeBlock });
  }
  return source.read(sourceApi, amounts);
}
