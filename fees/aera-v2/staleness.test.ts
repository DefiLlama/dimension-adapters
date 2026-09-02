import test from "node:test";
import assert from "node:assert/strict";
import { classifyApySnapshot, shouldRefuseStaleApyDataset, STALE_APY_THRESHOLD_SECONDS, FUTURE_SKEW_TOLERANCE_SECONDS } from "./index";

// Aera's external_apy field is currently frozen/absent (100% coverage failure,
// as of 2026-09) for every real vault, so several branches below aren't
// observable against the live API. These exercise the real exported decision
// functions the fetch() loop uses, against synthetic snapshots - including the
// three gaps a Codex adversarial review caught in an earlier count-based draft
// of this guard (missing-data bypass, count- vs TVL-weighted tolerance,
// malformed/future timestamps failing open).

const NOW = Math.floor(Date.now() / 1000);
const freshSnapshot = (ageSeconds: number) => ({ value: 0.05, timestamp: new Date((NOW - ageSeconds) * 1000).toISOString() });

test("classifyApySnapshot: a recent snapshot is fresh", () => {
  assert.equal(classifyApySnapshot(NOW, freshSnapshot(60)), "fresh");
});

test("classifyApySnapshot: a snapshot older than the threshold is stale", () => {
  assert.equal(classifyApySnapshot(NOW, freshSnapshot(STALE_APY_THRESHOLD_SECONDS + 1)), "stale");
});

test("classifyApySnapshot: a missing summary.external_apy (empty {} response) is 'missing'", () => {
  assert.equal(classifyApySnapshot(NOW, undefined), "missing");
  assert.equal(classifyApySnapshot(NOW, null), "missing");
});

test("classifyApySnapshot: an unparseable timestamp is 'invalid', not silently treated as fresh", () => {
  assert.equal(classifyApySnapshot(NOW, { value: 0.05, timestamp: "not-a-date" }), "invalid");
});

test("classifyApySnapshot: a non-finite value is 'invalid'", () => {
  assert.equal(classifyApySnapshot(NOW, { value: NaN, timestamp: new Date().toISOString() }), "invalid");
});

test("classifyApySnapshot: a snapshot from beyond the future-skew tolerance is 'invalid', not silently trusted", () => {
  const farFuture = new Date((NOW + FUTURE_SKEW_TOLERANCE_SECONDS + 3600) * 1000).toISOString();
  assert.equal(classifyApySnapshot(NOW, { value: 0.05, timestamp: farFuture }), "invalid");
});

test("classifyApySnapshot: minor clock skew within tolerance is still fresh", () => {
  const nearFuture = new Date((NOW + 60) * 1000).toISOString();
  assert.equal(classifyApySnapshot(NOW, { value: 0.05, timestamp: nearFuture }), "fresh");
});

test("shouldRefuseStaleApyDataset: all TVL has usable apy - no refusal", () => {
  assert.equal(shouldRefuseStaleApyDataset(1_000_000, 0), false);
});

test("shouldRefuseStaleApyDataset: today's real observed state (100% of TVL has a problem) refuses", () => {
  assert.equal(shouldRefuseStaleApyDataset(0, 45_795_991), true);
});

test("shouldRefuseStaleApyDataset: the Codex-caught whale scenario - one $29M vault missing among nine dust-TVL fresh vaults refuses", () => {
  // Count-weighted (the original, wrong draft) would see 1/10 = 10% and NOT refuse.
  // TVL-weighted correctly sees $29M/$29.009M ~= 99.97% and refuses.
  const dustTvlWithFreshApy = 9_000;
  const whaleTvlMissingApy = 29_000_000;
  assert.equal(shouldRefuseStaleApyDataset(dustTvlWithFreshApy, whaleTvlMissingApy), true);
});

test("shouldRefuseStaleApyDataset: the Codex-caught 0/0 bypass - a fully missing field on every vault must NOT be silently OK", () => {
  // In the original draft, a MISSING snapshot was skipped entirely (never counted),
  // so if literally every vault had 0 TVL-with-apy-data, the ratio check divided
  // 0/0 and was defined to return false ("nothing to refuse") - silently letting a
  // fully-broken feed through as management-fees-only. Missing now counts as a
  // problem, so this same real-world shape (all vaults have TVL, all are missing
  // apy data) now correctly refuses instead.
  assert.equal(shouldRefuseStaleApyDataset(0, 5_000_000), true);
});

test("shouldRefuseStaleApyDataset: isolated dust-value staleness under 10% of TVL is tolerated", () => {
  assert.equal(shouldRefuseStaleApyDataset(950_000, 50_000), false);
});

test("shouldRefuseStaleApyDataset: no vault ever had any TVL at all - nothing to refuse over", () => {
  assert.equal(shouldRefuseStaleApyDataset(0, 0), false);
});
