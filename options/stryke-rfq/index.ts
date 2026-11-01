import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import ADDRESSES from '../../helpers/coreAssets.json';

// Current address: https://app.stryke.xyz (VITE_SETTLEMENT_4663 in the public bundle).
// Previous deployments are returned by https://api.rfq.stryke.xyz/indexer/portfolio?taker=<address>.
// Evidence and transaction reconciliation are supplied in the PR; these contracts are not explorer-verified.
// Historical scope includes early deployments and Arbitrum test fills at the team's explicit request.
export const legacySettlement = '0x1fa225166e84cade8fb74384622dbdf6cfe55929';
export const deployments = [
  { address: legacySettlement, start: '2026-10-04', version: 0 },
  { address: '0x98d43a79815e034e480537c23ea6cef7dfcb9d29', start: '2026-10-11', version: 1 },
  { address: '0x9387490e2572bd4ab10aeba7ad45e148803f5d75', start: '2026-10-12', version: 1 },
  { address: '0xa84548bb2e28ae9279574973171b4f9d47b0669b', start: '2026-10-16', version: 2 },
  { address: '0x334d303aa7da47289df4111ffd6cef7512631347', start: '2026-10-24', version: 2 },
  { address: '0x6f1285fd060259e535c8e7526009d5c6ae247024', start: '2026-10-30', version: 3 },
];

// Arbitrum/USDC is included with the team's explicit authorization, including
// the October 30 test history. This does not assert a production launch date.
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
      dailyNotionalVolume.add(token, log.answer.notional.toString(), 'Options Notional');
      dailyPremiumVolume.add(token, log.answer.charged.toString(), 'Options Premiums');
      dailyFees.add(token, log.answer.fee.toString(), 'Options Trading Fees');
      dailyRevenue.add(token, log.answer.fee.toString(), 'Options Trading Fees To Stryke');
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
      dailyNotionalVolume.add(token, price.notional.toString(), 'Options Notional');
      // Executed premium includes buy payments and gross sale proceeds.
      // The app's premium-collected card counts buy payments only.
      dailyPremiumVolume.add(token, log.premium.toString(), 'Options Premiums');
      dailyFees.add(token, price.fee.toString(), 'Options Trading Fees');
      dailyRevenue.add(token, price.fee.toString(), 'Options Trading Fees To Stryke');
    }
  }
  return { dailyNotionalVolume, dailyPremiumVolume, dailyFees, dailyRevenue };
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
    Revenue: 'Trading fees directed to the Stryke fee recipient on confirmed RFQ fills, before subsequent token-holder allocation; excludes settlement charges and external venue fees.',
  },
  breakdownMethodology: {
    NotionalVolume: { 'Options Notional': 'Underlying notional of confirmed option fills, denominated in USDG on Robinhood or USDC on Arbitrum.' },
    PremiumVolume: { 'Options Premiums': 'Premium or proceeds charged by the maker for each confirmed fill, in the chain payment token.' },
    Fees: { 'Options Trading Fees': 'The actual fee in each FillConfirmed answer; no fixed fee-rate estimate is used.' },
    Revenue: { 'Options Trading Fees To Stryke': 'The fee sent to answer.feeRecipient, separately from the premium paid to the maker.' },
  },
} satisfies SimpleAdapter;

export default adapter;
