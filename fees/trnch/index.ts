import { AbiCoder } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { FeeCollectedEvent, FeesForwardedEvent, getFeeForwarders } from "../lifi/feeSources";
import { FeeRouter, getRouterFeePayments, normalizeToken, padAddress, TRNCH_START, TRNCH_TREASURY_SAFE } from "../../aggregators/trnch";

// TRNCH charges an integrator fee on top of the routers' own fees. Fee grid set server-side by TRNCH
// (src/lib/swap/fees.ts, FEE_BPS, capped at 1.5%): 0.5% on a single swap, 1% on a swap of a token picked
// from the TRNCH Heat ranking, 1% on a basket (several swaps signed at once), 1.5% on a basket built from
// the Heat ranking, 1% on LI.FI bridges. All fees are paid to the TRNCH treasury Safe.

// Wallet that receives the partners' share of the fees from the treasury Safe (TRNCH operations wallet)
const TRNCH_PARTNER_PAYOUT_WALLET = '0x5B77A9C6E3BCee8b5BB76176E2F6De0E65d515E2';

const NULL_ADDRESS = '0x0000000000000000000000000000000000000000';
const FEES_COLLECTED_TOPIC = '0x28a87b6059180e46de5fb9ab35eb043e8fe00ab45afcc7789e3934ecbbcde3ea';
// SafeL2 logs every executed Safe transaction, which covers ETH payouts (no Transfer event)
const SafeMultiSigTransactionEvent = 'event SafeMultiSigTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures, bytes additionalInfo)';
const ExecutionFailureEvent = 'event ExecutionFailure(bytes32 txHash, uint256 payment)';
const ERC20_TRANSFER_SELECTOR = '0xa9059cbb';
const MULTISEND_SELECTOR = '0x8d80ff0a'; // multiSend(bytes), called by delegatecall from the Safe

const FeeLabels: Record<'lifi' | FeeRouter, string> = {
  lifi: 'LI.FI Integrator Fees',
  kyberswap: 'KyberSwap Integrator Fees',
  '0x': '0x Integrator Fees',
  uniswap: 'Uniswap Integrator Fees',
};
const ToTreasury = 'Integrator Fees To Treasury';
const ToPartners = 'Integrator Fees To Partners';

type Payout = { token: string; amount: bigint };

// Decodes a Safe transaction into what it sent to the partner payout wallet: ETH value, ERC-20 transfer(),
// and the same inside a MultiSend batch.
function decodePayouts(to: string, value: bigint, data: string, operation: number, out: Payout[]) {
  const payee = TRNCH_PARTNER_PAYOUT_WALLET.toLowerCase();
  const input = String(data ?? '0x').toLowerCase();
  if (operation === 0) {
    if (to.toLowerCase() === payee && value > 0n) out.push({ token: NULL_ADDRESS, amount: value });
    if (input.startsWith(ERC20_TRANSFER_SELECTOR) && input.length >= 138) {
      const recipient = '0x' + input.slice(34, 74);
      if (recipient === payee) out.push({ token: normalizeToken(to), amount: BigInt('0x' + input.slice(74, 138)) });
    }
    return;
  }
  if (operation === 1 && input.startsWith(MULTISEND_SELECTOR)) {
    const [packed] = AbiCoder.defaultAbiCoder().decode(['bytes'], '0x' + input.slice(10));
    const hex = String(packed).slice(2);
    let i = 0;
    while (i + 170 <= hex.length) { // 1 byte operation, 20 bytes to, 32 bytes value, 32 bytes data length
      const op = parseInt(hex.slice(i, i + 2), 16);
      const innerTo = '0x' + hex.slice(i + 2, i + 42);
      const innerValue = BigInt('0x' + hex.slice(i + 42, i + 106));
      const length = Number(BigInt('0x' + hex.slice(i + 106, i + 170))) * 2;
      const innerData = '0x' + hex.slice(i + 170, i + 170 + length);
      decodePayouts(innerTo, innerValue, innerData, op, out);
      i += 170 + length;
    }
  }
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const payouts = options.createBalances();
  const safe = TRNCH_TREASURY_SAFE.toLowerCase();

  // LI.FI: integrator fees credited to the TRNCH Safe in the LI.FI FeeCollector, and fees the LI.FI
  // FeeForwarders send straight to it. LI.FI's own cut (_lifiFee, other recipients) is not TRNCH's.
  const [collected, forwarded] = await Promise.all([
    options.getLogs({ target: LifiFeeCollectors[CHAIN.ROBINHOOD].id, eventAbi: FeeCollectedEvent, topics: [FEES_COLLECTED_TOPIC, null as any, padAddress(TRNCH_TREASURY_SAFE)], maxBlockRange: 100000 }),
    options.getLogs({ targets: getFeeForwarders(options.chain), eventAbi: FeesForwardedEvent, maxBlockRange: 100000 }),
  ]);
  for (const log of collected) {
    if (String(log._integrator).toLowerCase() === safe) dailyFees.add(normalizeToken(log._token), log._integratorFee, FeeLabels.lifi);
  }
  for (const log of forwarded) {
    for (const fee of log.fees) {
      if (String(fee.recipient).toLowerCase() === safe) dailyFees.add(normalizeToken(log.token), fee.amount, FeeLabels.lifi);
    }
  }

  // KyberSwap, 0x, Uniswap: fees paid to the Safe inside transactions sent to the router
  for (const payment of await getRouterFeePayments(options)) {
    for (const fee of payment.fees) dailyFees.add(fee.token, fee.amount, FeeLabels[payment.router]);
  }

  // Partners' share: everything the Safe sends to the partner payout wallet during the day
  const [safeTxs, failures] = await Promise.all([
    options.getLogs({ target: TRNCH_TREASURY_SAFE, eventAbi: SafeMultiSigTransactionEvent, entireLog: true }),
    options.getLogs({ target: TRNCH_TREASURY_SAFE, eventAbi: ExecutionFailureEvent, entireLog: true }),
  ]);
  const failed = new Set(failures.map((log: any) => String(log.transactionHash).toLowerCase()));
  for (const log of safeTxs) {
    if (failed.has(String(log.transactionHash).toLowerCase())) continue;
    const out: Payout[] = [];
    decodePayouts(log.args.to, BigInt(log.args.value), log.args.data, Number(log.args.operation), out);
    for (const payout of out) payouts.add(payout.token, payout.amount);
  }

  // Revenue = fees - partner payouts of the same day, floored at 0 (a payout larger than the day's fees
  // makes that day's revenue 0; the excess is not carried over to other days)
  const feesUsd = await dailyFees.getUSDValue();
  const payoutsUsd = await payouts.getUSDValue();
  const toPartnersUsd = Math.min(payoutsUsd, feesUsd);
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  dailyRevenue.addUSDValue(feesUsd - toPartnersUsd, ToTreasury);
  dailySupplySideRevenue.addUSDValue(toPartnersUsd, ToPartners);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  // revenue nets the day's partner payouts against the day's fees, so it needs the full-day window
  pullHourly: false,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: TRNCH_START,
  methodology: {
    Fees: 'Integrator fee TRNCH adds to swaps and bridges made on TRNCH (0.5% on a single swap, 1% on a swap of a token from the TRNCH Heat ranking or on a basket of swaps, 1.5% on a basket built from the Heat ranking, 1% on bridges), paid to the TRNCH treasury Safe through LI.FI, KyberSwap, 0x and Uniswap. Router and DEX fees are excluded.',
    UserFees: 'Users pay the full TRNCH integrator fee.',
    Revenue: 'Integrator fees kept by TRNCH: fees received by the treasury Safe minus the partners\' share it pays out to the partner payout wallet the same day, never below 0 on a given day.',
    ProtocolRevenue: 'Integrator fees kept by the TRNCH treasury.',
    SupplySideRevenue: 'Share of the integrator fees the TRNCH treasury pays to partners through its partner payout wallet.',
  },
  breakdownMethodology: {
    Fees: {
      [FeeLabels.lifi]: 'TRNCH integrator fees on LI.FI swaps and bridges, credited to the TRNCH Safe by the LI.FI FeeCollector or sent to it by the LI.FI FeeForwarder.',
      [FeeLabels.kyberswap]: 'TRNCH integrator fees paid to the TRNCH Safe in KyberSwap router transactions.',
      [FeeLabels['0x']]: 'TRNCH integrator fees paid to the TRNCH Safe in 0x AllowanceHolder transactions.',
      [FeeLabels.uniswap]: 'TRNCH integrator fees paid to the TRNCH Safe in Uniswap Universal Router transactions.',
    },
    UserFees: {
      [FeeLabels.lifi]: 'TRNCH integrator fees on LI.FI swaps and bridges.',
      [FeeLabels.kyberswap]: 'TRNCH integrator fees on KyberSwap swaps.',
      [FeeLabels['0x']]: 'TRNCH integrator fees on 0x swaps.',
      [FeeLabels.uniswap]: 'TRNCH integrator fees on Uniswap swaps.',
    },
    Revenue: {
      [ToTreasury]: 'Integrator fees received by the TRNCH treasury Safe minus the partners\' share paid out the same day.',
    },
    ProtocolRevenue: {
      [ToTreasury]: 'Integrator fees received by the TRNCH treasury Safe minus the partners\' share paid out the same day.',
    },
    SupplySideRevenue: {
      [ToPartners]: 'Transfers from the TRNCH treasury Safe to the partner payout wallet, up to the day\'s fees.',
    },
  },
};

export default adapter;
