import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";

// BOB is an OP-stack chain with a modified fee split: most of what users pay lands in the
// OperatorFeeVault rather than the BaseFeeVault, so all four vaults are summed. Over the last
// seven days the three standard vaults hold only about a seventh of the total.
const SEQUENCER_FEE_VAULT = '0x4200000000000000000000000000000000000011';
const L1_FEE_VAULT = '0x420000000000000000000000000000000000001a';
const BASE_FEE_VAULT = '0x4200000000000000000000000000000000000019';
const OPERATOR_FEE_VAULT = '0x420000000000000000000000000000000000001b';
const FEE_VAULTS = [SEQUENCER_FEE_VAULT, L1_FEE_VAULT, BASE_FEE_VAULT, OPERATOR_FEE_VAULT];

// A withdrawal moves value out of a vault, so it is added back to the day's balance change.
// The OperatorFeeVault is the exception: all five withdrawals it has made paid into the
// BaseFeeVault, so the value never left the four-vault total and adding it back would count
// it twice.
const WITHDRAWING_VAULTS = [SEQUENCER_FEE_VAULT, L1_FEE_VAULT, BASE_FEE_VAULT];

const LABEL = 'sequencer fees';

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  await options.api.sumTokens({ owners: FEE_VAULTS, tokens: [ADDRESSES.null] });
  await options.fromApi.sumTokens({ owners: FEE_VAULTS, tokens: [ADDRESSES.null] });

  const logs = await options.getLogs({
    targets: WITHDRAWING_VAULTS,
    eventAbi: 'event Withdrawal(uint256 value, address to, address from)',
    flatten: true,
  });
  logs.forEach((log: any) => dailyFees.addGasToken(log.value, LABEL));

  dailyFees.addBalances(options.api.getBalancesV2(), LABEL);
  dailyFees.subtract(options.fromApi.getBalancesV2(), LABEL);

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
  version: 1,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.BOB],
  start: "2024-04-12",
};

export default adapter;
