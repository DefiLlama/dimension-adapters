import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getFees } from "../helpers/ethereum-l2";

// OP-stack fee vault predeploys, per the Optimism specs:
// https://specs.optimism.io/protocol/predeploys.html
const SEQUENCER_FEE_VAULT = '0x4200000000000000000000000000000000000011';
const L1_FEE_VAULT = '0x420000000000000000000000000000000000001a';
const BASE_FEE_VAULT = '0x4200000000000000000000000000000000000019';
// OperatorFeeVault, added by the Isthmus upgrade:
// https://specs.optimism.io/protocol/isthmus/exec-engine.html#operator-fee
const OPERATOR_FEE_VAULT = '0x420000000000000000000000000000000000001b';

// BOB charges an operator fee, so most of what users pay accrues in the OperatorFeeVault rather
// than the BaseFeeVault and all four vaults have to be summed.
const FEE_VAULTS = [SEQUENCER_FEE_VAULT, L1_FEE_VAULT, BASE_FEE_VAULT, OPERATOR_FEE_VAULT];

// Withdrawals are added back to the balance delta because they move value out of a vault. The
// OperatorFeeVault is the exception: every withdrawal it has ever made paid into the BaseFeeVault
// (5 of 5 — 13.251630, 10.000890, 9.308640, 0.500160 and 0.500625 ETH, all with
// to = 0x4200000000000000000000000000000000000019), so that value stays inside the four-vault
// total and adding it back would count it twice. The other three vaults withdraw to
// 0xc91482a96e9c2a104d9298d1980eccf8c4dc764e, outside the set, so theirs are added back.
const WITHDRAWING_VAULTS = [SEQUENCER_FEE_VAULT, L1_FEE_VAULT, BASE_FEE_VAULT];

const LABEL = 'sequencer fees';

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getFees(options, {
    feeVaults: FEE_VAULTS,
    withdrawingVaults: WITHDRAWING_VAULTS,
    label: LABEL,
  });

  return { dailyFees, dailyRevenue: dailyFees.clone() };
};

const methodology = {
  Fees: "All fees collected by the Bob L2 sequencer from transaction processing.",
  Revenue: "All revenue collected by the Bob L2 sequencer from transaction processing.",
};

const breakdownMethodology = {
  Fees: {
    'sequencer fees': 'All fees collected by the Bob L2 sequencer from transaction processing.',
  },
  Revenue: {
    'sequencer fees': 'All revenue collected by the Bob L2 sequencer from transaction processing.',
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.BOB],
  start: "2024-04-12",
};

export default adapter;
