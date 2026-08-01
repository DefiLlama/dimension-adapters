import { CHAIN } from "../helpers/chains";
import { FetchOptions, SimpleAdapter, FetchResultFees } from "../adapters/types";

interface TonLstExportConfigs {
  poolAddress: string;
  // Optional override for the protocol's commission as a percentage (0-100).
  // When omitted, the helper reads `governance_fee` directly from the pool's
  // get_pool_full_data() on-chain. The on-chain value is preferred so the
  // adapter stays correct when the pool's governance updates the rate.
  feeShareRatio?: number;
  methodology?: any;
}

// `get_pool_full_data` is the canonical getter on the TON Liquid Staking
// Protocol pool contract — see the official interface spec at
// https://github.com/ton-blockchain/liquid-staking-contract/blob/main/docs/get-method-interface.md
//
// Stack layout (with `tvm.Slice` input arg that the contract ignores):
//   stack[0]  : input slice echoed back by the runtime
//   stack[3]  : total_balance         (TON accounted by the pool, in nanoton)
//   stack[12] : governance_fee        (share of pool profit sent to governance,
//                                      encoded as a 24-bit fraction of 2**24)
//   stack[14] : supply                (number of pool jettons issued)
const STACK_TOTAL_BALANCE = 3;
const STACK_GOVERNANCE_FEE = 12;
const STACK_SUPPLY = 14;
const GOVERNANCE_FEE_DENOM = 2 ** 24; // per the 24-bit encoding in the spec

interface PoolSnapshot {
  totalBalance: number;
  supply: number;
  governanceFeeFraction: number; // 0..1, e.g. 0.16 for Tonstakers
}

async function fetchPoolSnapshot(blockNumber: number, poolAddress: string): Promise<PoolSnapshot> {
  const url = 'https://ton-mainnet.core.chainstack.com/f2a2411bce1e54a2658f2710cd7969c3/api/v2/runGetMethod';
  const payload = {
    address: poolAddress,
    method: "get_pool_full_data",
    stack: [
      [
        "tvm.Slice",
        "te6cckEBAQEAJAAAQ4AbUzrTQYTUv8s/I9ds2TSZgRjyrgl2S2LKcZMEFcxj6PARy3rF",
      ],
    ],
    seqno: blockNumber,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  const stack = data.result.stack;
  const totalBalance = parseInt(stack[STACK_TOTAL_BALANCE][1], 16);
  const supply = parseInt(stack[STACK_SUPPLY][1], 16);
  const governanceFeeRaw = parseInt(stack[STACK_GOVERNANCE_FEE][1], 16);
  return {
    totalBalance,
    supply,
    governanceFeeFraction: governanceFeeRaw / GOVERNANCE_FEE_DENOM,
  };
}

const fetchFees = async (options: FetchOptions, config: TonLstExportConfigs): Promise<FetchResultFees> => {
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const yesterday = await fetchPoolSnapshot(fromBlock, config.poolAddress);
  const today = await fetchPoolSnapshot(toBlock, config.poolAddress);

  if (!yesterday.totalBalance || !today.totalBalance) {
    throw new Error('Invalid data');
  }

  // Net rewards distributed to depositors over the window. The pool's share
  // rate (total_balance / supply) grows by the per-jetton yield NET of the
  // governance fee, so multiplying by today's supply converts the rate delta
  // back into total TON paid out to depositors.
  const depositorRewardsTon =
    ((today.totalBalance / today.supply) - (yesterday.totalBalance / yesterday.supply))
    * (today.supply / 1e9);

  // Prefer the on-chain governance_fee snapshot (today's value). Fall back to
  // the explicit feeShareRatio override only when the pool exposes no fee
  // field (governanceFeeFraction === 0 with config.feeShareRatio set).
  const feeFraction = config.feeShareRatio !== undefined
    ? config.feeShareRatio / 100
    : today.governanceFeeFraction;

  // depositorRewards = totalRewards * (1 - feeFraction)  =>  totalRewards = depositorRewards / (1 - feeFraction)
  // For pools with no governance fee, totalRewards == depositorRewards (no fee inflation needed).
  const totalRewardsTon = feeFraction < 1
    ? depositorRewardsTon / (1 - feeFraction)
    : depositorRewardsTon;
  const protocolRewardsTon = totalRewardsTon - depositorRewardsTon;

  dailyFees.addCGToken("the-open-network", totalRewardsTon, 'TON Staking Rewards');
  dailyRevenue.addCGToken("the-open-network", protocolRewardsTon, 'Staking Rewards Protocol Commission');
  dailySupplySideRevenue.addCGToken("the-open-network", depositorRewardsTon, 'Staking Rewards To Stakers');

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

export function tonLstExport(exportConfig: TonLstExportConfigs) {
  const adapter: SimpleAdapter = {
    version: 1,
    methodology: exportConfig.methodology ?? {
      Fees: 'TON staking rewards earned by the pool from validators.',
      UserFees: 'TON staking rewards earned on user deposits.',
      Revenue: 'Share of staking rewards retained by pool governance (read on-chain from the pool contract).',
      ProtocolRevenue: 'Share of staking rewards retained by pool governance.',
      SupplySideRevenue: 'Net staking rewards distributed to LST holders after commission/protocol fees.',
    },
    breakdownMethodology: {
      Fees: {
        'TON Staking Rewards': 'All rewards collected from TON Liquid Staking.',
      },
      Revenue: {
        'Staking Rewards Protocol Commission': 'Amount of rewards are collected by protocol.',
      },
      SupplySideRevenue: {
        'Staking Rewards To Stakers': 'Net staking rewards distributed to LST holders after commission/protocol fees.',
      },
    },
    fetch: (options: FetchOptions) => fetchFees(options, exportConfig),
    chains: [CHAIN.TON],
  };
  return adapter;
}
