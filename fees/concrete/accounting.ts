/**
 * A vault's yield over a window, from its exchange rate at every block in which share supply changed.
 *
 * Between two consecutive rate points the shares outstanding at the first are worth the vault's
 * exchange rate each (assets per share, the same formula Concrete's backend uses); whatever that
 * rate gained by the second point is what the strategies earned for them. Every deposit and
 * redemption is a point, so the shares a segment accrues on are exactly the shares that existed
 * during it.
 *
 * Protocol fee shares are minted to the protocol and dilute the exchange rate; the dilution shows
 * up as negative holder yield and the shares themselves, valued at the rate they were minted at,
 * as protocol revenue. The two add back up to what the strategies earned.
 */

export type RatePoint = {
  block: number;
  totalSupply: bigint;
  /** In the asset's raw units; zero once the vault is valueless. */
  totalAssets: bigint;
  /** An operator minted or burned shares in this block, outside deposit and redeem. */
  adminSupplyChange: boolean;
};

/** Shares minted to the protocol's fee recipients: DefiLlama's "revenue" (Concrete's "fees"). */
export type ProtocolRevenueFeeMint = { block: number; shares: bigint; kind: 'management' | 'performance' };

export type VaultDecimals = { decimals: number; assetDecimals: number };

/** Asset raw units. */
export type VaultYield = { holderYield: bigint; managementFees: bigint; performanceFees: bigint };

const valued = (point: RatePoint) => point.totalSupply > 0n && point.totalAssets > 0n;

/**
 * Assets per share in asset raw units, as Concrete's `calculate_e_rate`: one share's worth, with
 * one raw asset unit and one raw share unit (at the asset's scale) added as a failsafe so an empty
 * or dust vault reads as a rate of 1.
 */
export function exchangeRate(point: RatePoint, { decimals, assetDecimals }: VaultDecimals): bigint {
  if (point.totalSupply === 0n) return 10n ** BigInt(assetDecimals);
  return (10n ** BigInt(decimals) * (point.totalAssets + 1n)) / (point.totalSupply + 10n ** BigInt(decimals - assetDecimals));
}

/** What `shares` are worth at the point's exchange rate, in asset raw units. */
const valueOf = (shares: bigint, point: RatePoint, vault: VaultDecimals) =>
  (shares * exchangeRate(point, vault)) / 10n ** BigInt(vault.decimals);

export function integrate(points: RatePoint[], feeMints: ProtocolRevenueFeeMint[], vault: VaultDecimals): VaultYield {
  const sorted = [...points].sort((a, b) => a.block - b.block);

  let holderYield = 0n;
  for (let i = 1; i < sorted.length; i++) {
    const [prev, next] = [sorted[i - 1], sorted[i]];
    // No valuation at one end: the step into a valuation (first deposits still pending
    // allocation) or out of one (a migration, a full redemption) is not yield.
    if (!valued(prev) || !valued(next)) continue;
    // Shares issued or retired at the operator's price reprice the vault without moving assets.
    if (next.adminSupplyChange) continue;
    holderYield += valueOf(prev.totalSupply, next, vault) - valueOf(prev.totalSupply, prev, vault);
  }

  let managementFees = 0n;
  let performanceFees = 0n;
  for (const mint of feeMints) {
    const point = sorted.find((p) => p.block === mint.block);
    if (!point) throw new Error(`fee mint at block ${mint.block} has no rate point`);
    if (!valued(point)) continue;
    if (mint.kind === 'management') managementFees += valueOf(mint.shares, point, vault);
    else performanceFees += valueOf(mint.shares, point, vault);
  }

  return { holderYield, managementFees, performanceFees };
}
