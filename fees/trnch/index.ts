import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { LifiFeeCollectors } from "../../helpers/aggregators/lifi";
import { FeeCollectedEvent, FeesForwardedEvent, getFeeForwarders } from "../lifi/feeSources";
import { FeeRouter, getRouterFeePayments, normalizeToken, padAddress, TRNCH_START, TRNCH_TREASURY_SAFE } from "../../aggregators/trnch";

// TRNCH charges an integrator fee on top of the routers' own fees. Fee grid set server-side by TRNCH
// (src/lib/swap/fees.ts, FEE_BPS, capped at 1.5%): 0.5% on a single swap, 1% on a swap of a token picked
// from the TRNCH Heat ranking, 1% on a basket (several swaps signed at once), 1.5% on a basket built from
// the Heat ranking, 1% on LI.FI bridges. All fees are paid to the TRNCH treasury Safe.

const FEES_COLLECTED_TOPIC = '0x28a87b6059180e46de5fb9ab35eb043e8fe00ab45afcc7789e3934ecbbcde3ea';

const FeeLabels: Record<'lifi' | FeeRouter, string> = {
  lifi: 'LI.FI Integrator Fees',
  kyberswap: 'KyberSwap Integrator Fees',
  '0x': '0x Integrator Fees',
  uniswap: 'Uniswap Integrator Fees',
};
const ToTreasury = 'Integrator Fees To Treasury';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
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

  // TRNCH keeps all the integrator fees it receives
  const dailyRevenue = dailyFees.clone(1, ToTreasury);

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(),
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: TRNCH_START,
  methodology: {
    Fees: 'Integrator fee TRNCH adds to swaps and bridges made on TRNCH (0.5% on a single swap, 1% on a swap of a token from the TRNCH Heat ranking or on a basket of swaps, 1.5% on a basket built from the Heat ranking, 1% on bridges), paid to the TRNCH treasury Safe through LI.FI, KyberSwap, 0x and Uniswap. Router and DEX fees are excluded.',
    UserFees: 'Users pay the full TRNCH integrator fee.',
    Revenue: 'All integrator fees received by the TRNCH treasury Safe are kept by TRNCH.',
    ProtocolRevenue: 'All integrator fees go to the TRNCH treasury.',
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
      [ToTreasury]: 'Integrator fees received by the TRNCH treasury Safe.',
    },
    ProtocolRevenue: {
      [ToTreasury]: 'Integrator fees received by the TRNCH treasury Safe.',
    },
  },
};

export default adapter;
