import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import ADDRESSES from '../../helpers/coreAssets.json';

// Current address: https://app.stryke.xyz (VITE_SETTLEMENT_4663 in the public bundle).
// Previous deployments are returned by https://api.rfq.stryke.xyz/indexer/portfolio?taker=<address>.
// Evidence and transaction reconciliation are supplied in the PR; these contracts are not explorer-verified.
// Historical scope includes the early Robinhood deployments and Arbitrum/USDC.
export const legacySettlement = '0x1fa225166e84cade8fb74384622dbdf6cfe55929';
export const deployments = [
  { address: legacySettlement, start: '2026-10-04', version: 0 },
  { address: '0x98d43a79815e034e480537c23ea6cef7dfcb9d29', start: '2026-10-11', version: 1 },
  { address: '0x9387490e2572bd4ab10aeba7ad45e148803f5d75', start: '2026-10-12', version: 1 },
  { address: '0xa84548bb2e28ae9279574973171b4f9d47b0669b', start: '2026-10-16', version: 2 },
  { address: '0x334d303aa7da47289df4111ffd6cef7512631347', start: '2026-10-24', version: 2 },
  { address: '0x6f1285fd060259e535c8e7526009d5c6ae247024', start: '2026-10-30', version: 3 },
];

// Arbitrum/USDC history begins on October 30, 2026.
export const chainConfig: Record<string, { start: string; token: string; fromBlock: number; deployments: typeof deployments }> = {
  [CHAIN.ROBINHOOD]: { start: '2026-10-04', token: ADDRESSES.robinhood.USDG, fromBlock: 79843602, deployments },
  [CHAIN.ARBITRUM]: { start: '2026-10-30', token: ADDRESSES.arbitrum.USDC, fromBlock: 519639774,
    deployments: [{ address: '0x6f1285fd060259e535c8e7526009d5c6ae247024', start: '2026-10-30', version: 3 }] },
};

// The tuple is published in the app's structure-BdbkFK2k.js ABI. The historical variants'
// canonical signatures match the actual topic0 values; amounts reconcile with public portfolio records.
const fields = 'address indexed maker, uint256 indexed quoteNonce, address indexed taker, bytes32 position, uint256 collateral, uint256 size, (uint256 charged, uint256 mark, uint256 notional, uint256 fee, address feeRecipient) answer';
export const fillEvents: Record<number, string> = {
  1: `event FillConfirmed(${fields})`,
  2: `event FillConfirmed(${fields}, bool paymentDeferred)`,
  3: `event FillConfirmed(${fields}, uint64 payBy)`,
};

// https://docs.stryke.xyz/tokenomics/protocol-fees: 20% retained, 80% to holders.
// October 30 coverage cutoff confirmed by the submitting team; earlier split unknown, so omitted.
// Run windows are hour/day aligned, so none straddles the cutoff.
const protocolRevenueStart = Date.parse('2026-10-30T00:00:00Z') / 1000;
const protocolShare = 0.2;

export async function fetchTrading(options: FetchOptions) {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  // Reviewed request logs use USDG on Robinhood and USDC on Arbitrum (both 6 decimals).
  // Let the SDK price the token; do not assume a $1 peg or return raw integers as USD.
  const { token, deployments: chainDeployments } = chainConfig[options.chain];
  for (const version of [1, 2, 3]) {
    const targets = chainDeployments
      .filter(d => d.version === version && Date.parse(d.start) / 1000 < options.endTimestamp)
      .map(d => d.address);
    if (!targets.length) continue;
    const logs = await options.getLogs({ targets, eventAbi: fillEvents[version] });
    for (const log of logs) {
      // Only confirmed fills count; requested/refunded fills, deposits, withdrawals,
      // maker hedge transactions and later payouts never create a second options trade.
      dailyNotionalVolume.add(token, log.answer.notional.toString());
      dailyPremiumVolume.add(token, log.answer.charged.toString());
      dailyFees.add(token, log.answer.fee.toString(), 'Options Trading Fees');
      dailyRevenue.add(token, log.answer.fee.toString(), 'RFQ Collected Trading Fees');
    }
  }
  if (options.chain === CHAIN.ROBINHOOD) {
    // October 4 contract emits pricing separately from confirmation. Signatures
    // match public logs; 46 paired fills reconcile exactly with fee transfers.
    const priced = await options.getLogs({ target: legacySettlement, eventAbi: 'event FillPriced(address indexed maker,uint256 indexed nonce,uint256 mark,uint256 notional,uint256 fee)' });
    const confirmed = await options.getLogs({ target: legacySettlement, eventAbi: 'event FillConfirmed(address indexed maker,uint256 indexed nonce,address indexed taker,uint256 position,address cashToken,uint256 collateral,uint256 size,uint256 premium)' });
    const key = (log: any) => log.maker.toLowerCase() + ':' + log.nonce.toString();
    const prices = new Map(priced.map(log => [key(log), log]));
    if (prices.size !== priced.length || priced.length !== confirmed.length) throw new Error('Legacy Stryke fill/pricing mismatch');
    for (const log of confirmed) {
      const price = prices.get(key(log));
      if (!price || log.cashToken.toLowerCase() !== token.toLowerCase()) throw new Error('Unexpected legacy Stryke fill');
      dailyNotionalVolume.add(token, price.notional.toString());
      // Executed premium includes buy payments and gross sale proceeds.
      // The app's premium-collected card counts buy payments only.
      dailyPremiumVolume.add(token, log.premium.toString());
      dailyFees.add(token, price.fee.toString(), 'Options Trading Fees');
      dailyRevenue.add(token, price.fee.toString(), 'RFQ Collected Trading Fees');
    }
  }
  if (options.startTimestamp < protocolRevenueStart) return { dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyRevenue };
  // Holders revenue (the other 80%) is not reported: no reward has been funded or claimed on-chain yet
  // (StakedSYK 0x20b2431557bB90954744a6D404f45aD1aD8719f4, sykASH distributor 0x1Bfa26a0dc850B3a9B7586Cc6f8f868B5204a3F1).
  const dailyProtocolRevenue = dailyRevenue.clone(protocolShare, 'Options Trading Fees To Protocol');
  return { dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyRevenue, dailyProtocolRevenue };
}

const adapter = {
  version: 2,
  pullHourly: true,
  adapter: chainConfig,
  fetch: fetchTrading,
  methodology: {
    NotionalVolume: 'Underlying notional recorded for each confirmed Stryke RFQ option purchase or sale, counted once on the chain where the fill is confirmed.',
    PremiumVolume: 'Actual premium or sale proceeds recorded for confirmed Stryke RFQ options fills, excluding protocol fees and refunded requests.',
    Fees: 'Actual trading fees recorded on confirmed Stryke RFQ fills; excludes settlement charges, external venue fees and sunsetted products.',
    Revenue: 'All trading fees recorded on confirmed RFQ fills, before subsequent token-holder allocation. Uses answer.fee for later deployments and paired FillPriced.fee for the October 4 deployment. No fee-recipient allowlist is enforced; legacy confirmation events do not expose a recipient. Excludes maker premiums, settlement deductions and external venue fees.',
    ProtocolRevenue: '20% of recorded RFQ trading fees from October 30, 2026, following the published protocol allocation. Earlier allocation is unknown and omitted. The 80% token-holder allocation is not counted until rewards are paid on-chain.',
  },
  breakdownMethodology: {
    Fees: { 'Options Trading Fees': 'The actual fee in each FillConfirmed answer; no fixed fee-rate estimate is used.' },
    Revenue: { 'RFQ Collected Trading Fees': 'All recorded fill fees: answer.fee on later deployments, or paired FillPriced.fee on the October 4 deployment. This is not a recipient-filtered treasury-transfer measure.' },
    ProtocolRevenue: { 'Options Trading Fees To Protocol': '20% retained protocol allocation of recorded RFQ trading fees from October 30, 2026; excludes the 80% holder allocation.' },
  },
} satisfies SimpleAdapter;

export default adapter;
