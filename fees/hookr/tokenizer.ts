import { FeeAccounting, toBigInt, lowercase, eventTopic, addressTopic } from './common';
import { BLOCK, CONTRACT } from './config';

const assetAt =
  'function assetAt(uint256) view returns((address currency,uint256 index,uint256 carry,uint128 received,' +
  'uint128 paid,uint128 pendingStream,uint64 streamEnd,uint64 lastRelease))';

/** The original collector earns as income vests; the newer tokenizer charges when a leg is paid. */
export async function fetchTokenizerFees(accounting: FeeAccounting) {
  await fetchOriginalTokenizerFees(accounting);
  await fetchCurrentTokenizerFees(accounting);
}

/** Earned income = closing claimable + lifetime claims - the corresponding opening entitlement. */
async function fetchOriginalTokenizerFees(accounting: FeeAccounting) {
  const { options } = accounting;
  const minted = await accounting.getLogs(
    [CONTRACT.oldTokenizer],
    'event Tokenized(address indexed token,address indexed creator,uint8 way,address forwarder,address adapter,' +
      'address door,bytes32 familyId,bytes32 marketFamilyId,uint256 supply,uint64 unlockBlock,uint16 legBps)',
    { fromBlock: BLOCK.oldTokenizer, cacheInCloud: true },
  );
  const feeBearingTokens = minted.filter(log => Number(log.args.legBps) !== 0);
  const assetCounts = feeBearingTokens.length
    ? await options.toApi.multiCall({
        abi: 'uint256:assetCount',
        calls: feeBearingTokens.map(log => lowercase(log.args.token)),
      })
    : [];
  const assets = feeBearingTokens.flatMap((log, index) =>
    Array.from({ length: Number(assetCounts[index]) }, (_, index) => ({
      token: lowercase(log.args.token),
      index,
      block: log.blockNumber,
    })),
  );
  const calls = assets.map(asset => ({ target: asset.token, params: [asset.index] }));
  const assetStates = assets.length ? await options.toApi.multiCall({ abi: assetAt, calls }) : [];
  const openingAssets = assets.filter(asset => asset.block < accounting.fromBlock);
  const claimable = 'function claimable(address,uint256) view returns(uint256)';
  const closingClaimable = assets.length
    ? await options.toApi.multiCall({
        abi: claimable,
        calls: assets.map(asset => ({
          target: asset.token,
          params: [CONTRACT.oldLegCollector, asset.index],
        })),
      })
    : [];
  const openingClaimableAmounts = openingAssets.length
    ? await accounting.openingApi.multiCall({
        abi: claimable,
        calls: openingAssets.map(asset => ({
          target: asset.token,
          params: [CONTRACT.oldLegCollector, asset.index],
        })),
      })
    : [];
  const openingClaimable = new Map(
    openingAssets.map((asset, index) => [
      `${asset.token}:${asset.index}`,
      toBigInt(openingClaimableAmounts[index]),
    ]),
  );
  const eventAbi =
    'event IncomeClaimed(address indexed account,uint256 indexed asset,address indexed to,uint256 amount)';
  const collectorClaims = await accounting.getLogs(
    feeBearingTokens.map(log => lowercase(log.args.token)),
    eventAbi,
    {
      fromBlock: BLOCK.oldTokenizer,
      topics: [eventTopic(eventAbi), addressTopic(CONTRACT.oldLegCollector)],
    },
  );
  assets.forEach((asset, index) => {
    const assetClaims = collectorClaims.filter(
      log => log.address === asset.token && Number(log.args.asset) === asset.index,
    );
    const totalClaimed = assetClaims.reduce((sum, log) => sum + toBigInt(log.args.amount), 0n);
    const previouslyClaimed = assetClaims
      .filter(log => log.blockNumber < accounting.fromBlock)
      .reduce((sum, log) => sum + toBigInt(log.args.amount), 0n);
    const earnedEnd = toBigInt(closingClaimable[index]) + totalClaimed;
    const earnedStart = (openingClaimable.get(`${asset.token}:${asset.index}`) ?? 0n) + previouslyClaimed;
    const gross = earnedEnd - earnedStart;
    // Original tokenizer terms: WTH is owed one point of the 5% collector leg, i.e. 20%.
    // https://github.com/Hookr-fun/hookr-contracts/blob/main/hookr-1/revenue-tokenizer/README.md#fees
    // Difference of cumulative entitlements keeps integer rounding additive across hourly pulls.
    const partner = earnedEnd / 5n - earnedStart / 5n;
    accounting.recordFees('tokenizer', assetStates[index].currency, gross, gross - partner);
  });
}

/** Count token-emitted LegPaid once; the forwarding door describes the same delivery. */
async function fetchCurrentTokenizerFees(accounting: FeeAccounting) {
  const { options } = accounting;
  const currentMints = await accounting.getLogs(
    [CONTRACT.newTokenizer],
    'event Tokenized(address indexed token,address indexed creator,uint256 supply,address streamManager,' +
      'bool openStreams)',
    { fromBlock: BLOCK.newTokenizer, cacheInCloud: true },
  );
  const tokens = currentMints.map(log => lowercase(log.args.token));
  const legPayments = await accounting.getLogs(
    tokens,
    'event LegPaid(uint256 indexed door,uint256 indexed asset,uint256 amount)',
  );
  // Resolve each distinct token/asset once; repeated payments use the same currency.
  const assetKey = (log: { address: string; args: Record<string, any> }) =>
    `${log.address}:${log.args.asset}`;
  const paidAssets = [...new Map(legPayments.map(log => [assetKey(log), log])).values()];
  const assetStates = paidAssets.length
    ? await options.toApi.multiCall({
        abi: assetAt,
        calls: paidAssets.map(log => ({ target: log.address, params: [log.args.asset] })),
      })
    : [];
  const currencies = new Map(
    paidAssets.map((log, index) => [assetKey(log), lowercase(assetStates[index].currency)]),
  );

  // New tokenizer fees are actual per-door delivery charges, not the old supply-share model.
  // Count the revenue-token event once; forwarding-door events describe the same payment.
  for (const log of legPayments) {
    accounting.recordFees(
      'tokenizer',
      currencies.get(assetKey(log))!,
      toBigInt(log.args.amount),
      toBigInt(log.args.amount),
    );
  }
}
