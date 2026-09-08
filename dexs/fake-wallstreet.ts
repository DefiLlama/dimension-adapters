import { ChainApi } from "@defillama/sdk";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// FWSPool: custodies tokenized-stock Lots, sells randomized draws (Packs) for ETH
const POOL = "0xf2b967494bbdd37cdfbe585e3b84b85461c7da37";
// FWSZap: ETH <-> stock-token entry/exit routes, charges zap/swap fees to the treasury
const ZAP = "0x79e8514e1280a6ad8399e21c142618e33c6742ef";
// FWSRewards: $FWS emissions, purchaser allowances and token buybacks/burns
const REWARDS = "0x3f9199f33cb49d8cd0eb43e0242421125eb19c85";
const BPS = 10_000n;

const METRICS = {
  PackFees: 'Pack Fees',
  CornerOfficePot: 'Corner Office Pot',
  RedemptionFees: 'Redemption Fees',
  ZapFees: 'Zap Fees',
  TokenBuybacks: 'Token Buybacks',
};

const ABIS = {
  PullSettled: "event PullSettled(uint64 indexed reqId)",
  RedeemFeeSkimmed: "event RedeemFeeSkimmed(uint256 indexed lotId, address indexed token, uint256 amount)",
  ZappedIn: "event ZappedIn(address indexed user, address indexed token, uint256 ethIn, uint256 rawOut, uint256 lotId)",
  ZappedOut: "event ZappedOut(address indexed user, address indexed token, uint256 rawIn, uint256 ethOut, uint256 fee)",
  AllowanceAccrued: "event AllowanceAccrued(address indexed buyer, uint256 amount)",
  Buyback: "event Buyback(uint256 ethIn, uint256 fwsOut, uint256 burned, uint256 toDepositors, uint256 toPurchasers)",
  BoughtAndBurned: "event BoughtAndBurned(uint256 ethIn, uint256 burned)",
  getRequest: "function getRequest(uint64 reqId) view returns ((address buyer, uint16 count, bool fulfilled, bool cancelled, uint40 requestedAt, uint40 expiresAt, uint16 negSlipBps, uint16 redeemFeeSnap, uint128 quotedEV, uint128 paidPoolFee, bytes32 rand))",
};

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // The public Robinhood Chain RPC prunes historical state, so all eth_calls run at the
  // latest block
  const latestApi = new ChainApi({ chain: options.chain });
  const [protocolCutBps, titheBps, zapFeeBps] = await Promise.all([
    latestApi.call({ target: POOL, abi: 'uint16:protocolCutBps' }),
    latestApi.call({ target: POOL, abi: 'uint16:titheBps' }),
    latestApi.call({ target: ZAP, abi: 'uint16:zapFeeBps' }),
  ]);

  const [settled, skims, zapIns, zapOuts, allowances, buybacks, boughtAndBurned] = await Promise.all([
    options.getLogs({ target: POOL, eventAbi: ABIS.PullSettled }),
    options.getLogs({ target: POOL, eventAbi: ABIS.RedeemFeeSkimmed }),
    options.getLogs({ target: ZAP, eventAbi: ABIS.ZappedIn }),
    options.getLogs({ target: ZAP, eventAbi: ABIS.ZappedOut }),
    options.getLogs({ target: REWARDS, eventAbi: ABIS.AllowanceAccrued }),
    options.getLogs({ target: REWARDS, eventAbi: ABIS.Buyback }),
    options.getLogs({ target: REWARDS, eventAbi: ABIS.BoughtAndBurned }),
  ]);

  const requests = await latestApi.multiCall({
    target: POOL,
    abi: ABIS.getRequest,
    calls: settled.map((log: any) => ({ params: [log.reqId] })),
  });

  // A pack's price is EV * (1 + surcharge): the EV portion pays for the stock lot delivered
  // to the buyer (the depositors' pro-rata distribution is their sale proceeds, not yield),
  // so only the surcharge over fair value counts as fees, computed per request as
  // paidPoolFee - quotedEV * count, exact regardless of any surchargeBps changes.
  let packVolume = 0n;
  let surcharge = 0n;
  let protocolCut = 0n;
  let cornerPot = 0n;
  requests.forEach((r: any) => {
    const gross = BigInt(r.paidPoolFee);
    const count = BigInt(r.count);
    const perItem = gross / count;
    packVolume += gross;
    surcharge += gross - BigInt(r.quotedEV) * count;
    protocolCut += (perItem * BigInt(protocolCutBps) / BPS) * count + (gross - perItem * count);
    cornerPot += (perItem * BigInt(titheBps) / BPS) * count;
  });
  let allowanceRebates = 0n;
  allowances.forEach((log: any) => { allowanceRebates += BigInt(log.amount); });
  // Depositors' net take: their share of the gross price minus the fair value of the lot
  // they collectively forfeited. Negative when the cold-pool allowance rebate is maxed
  // (the protocol cut and corner pot then come out of the lot's fair value).
  const depositorShare = surcharge - allowanceRebates - protocolCut - cornerPot;

  dailyVolume.addGasToken(packVolume);
  // Allowance rebates flow back to the purchaser, so they are netted out of fees
  dailyFees.addGasToken(surcharge - allowanceRebates, METRICS.PackFees);
  dailyRevenue.addGasToken(protocolCut, METRICS.PackFees);
  dailySupplySideRevenue.addGasToken(depositorShare, METRICS.PackFees);
  dailySupplySideRevenue.addGasToken(cornerPot, METRICS.CornerOfficePot);

  // Redemption fee: a redeemFeeBps skim of the stock tokens, taken when a winner claims,
  // relists or zaps out a won lot.
  skims.forEach((log: any) => {
    dailyFees.add(log.token, log.amount, METRICS.RedemptionFees);
    dailyRevenue.add(log.token, log.amount, METRICS.RedemptionFees);
  });

  // Zap fees to the treasury: zapFeeBps on ETH entering via zap-in (event carries the gross
  // msg.value), swapFeeBps on exits (event carries the fee).
  zapIns.forEach((log: any) => {
    const fee = BigInt(log.ethIn) * BigInt(zapFeeBps) / BPS;
    dailyFees.addGasToken(fee, METRICS.ZapFees);
    dailyRevenue.addGasToken(fee, METRICS.ZapFees);
  });
  zapOuts.forEach((log: any) => {
    dailyFees.addGasToken(log.fee, METRICS.ZapFees);
    dailyRevenue.addGasToken(log.fee, METRICS.ZapFees);
  });

  // Buybacks: funded from a buybackBps slice of the protocol cut (Buyback: 40/40/20
  // depositors/purchasers/burn) and from liquidated redemption skims (BoughtAndBurned).
  // Holders revenue only — the funding fees were already booked as revenue when they accrued.
  buybacks.forEach((log: any) => { dailyHoldersRevenue.addGasToken(log.ethIn, METRICS.TokenBuybacks); });
  boughtAndBurned.forEach((log: any) => { dailyHoldersRevenue.addGasToken(log.ethIn, METRICS.TokenBuybacks); });

  return { dailyVolume, dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};

const methodology = {
  Volume: "Gross ETH paid by purchasers for settled Pack draws (expected value plus the protocol surcharge), excluding refunded and expired requests and the third-party randomness fee.",
  Fees: "The protocol surcharge over fair value on settled Pack draws, net of purchaser $FWS-allowance rebates, plus redemption-fee skims on won stock lots and zap entry/exit fees.",
  Revenue: "Protocol cut of pack fees, redemption-fee skims and zap fees, all accruing to the treasury.",
  ProtocolRevenue: "Same as Revenue: the treasury's cut of pack fees, redemption skims and zap fees.",
  HoldersRevenue: "$FWS buybacks funded from the protocol's buyback share and from liquidated redemption skims (burned or redistributed).",
  SupplySideRevenue: "Depositors' net take from pack sales (their pro-rata share of the gross price minus the fair value of the lots forfeited), plus the Corner Office pot paid to the top-backed lot's depositor.",
};

const breakdownMethodology = {
  Fees: {
    [METRICS.PackFees]: "The 10% protocol surcharge over the quoted expected value on settled Pack draws, net of the surcharge slice rebated to purchasers as $FWS allowances.",
    [METRICS.RedemptionFees]: "Stock tokens skimmed (redeemFeeBps, 5% at launch, snapshotted per Pack) when a winner claims, relists or swaps out a won lot.",
    [METRICS.ZapFees]: "1% zap fee on ETH entering via zap-in plus 1% swap fee on stock exits to ETH.",
  },
  Revenue: {
    [METRICS.PackFees]: "Protocol cut (1%) of pack fees, sent to the treasury.",
    [METRICS.RedemptionFees]: "Redemption skims accrue to the protocol and are later liquidated into $FWS buy-and-burns.",
    [METRICS.ZapFees]: "Zap and swap fees accrue to the treasury.",
  },
  SupplySideRevenue: {
    [METRICS.PackFees]: "Depositors' net take: the pro-rata pack-price distribution across active Lots minus the fair value of the drawn lots forfeited. Can be negative in idle periods when the full surcharge is rebated to the purchaser.",
    [METRICS.CornerOfficePot]: "2.5% of each pack fee accruing to the depositor of the top-backed lot (the Corner Office).",
  },
  HoldersRevenue: {
    [METRICS.TokenBuybacks]: "$FWS buybacks: the scheduled buyback (40/40/20 split across depositors, purchasers and burn) plus buy-and-burns funded by liquidated redemption skims.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  allowNegativeValue: true, // depositors' net pack take goes negative when the cold-pool allowance rebate is maxed
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-08-13',
  methodology,
  breakdownMethodology,
};

export default adapter;
