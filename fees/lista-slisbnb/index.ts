import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

/**
 * Fetches data from Lista DAO
 * @doc https://listaorg.notion.site/Profit-cfd754931df449eaa9a207e38d3e0a54
 * @test npx ts-node --transpile-only cli/testAdapter.ts fees lista-slisbnb
 *
 * @treasury
 * https://bscscan.com/address/0x8d388136d578dcd791d081c6042284ced6d9b0c6#tokentxns
 * https://bscscan.com/address/0x34b504a5cf0ff41f8a480580533b6dda687fa3da#tokentxns
 */

const ListaStakeManagerAddress = "0x1adB950d8bB3dA4bE104211D5AB038628e477fE6";

// ListaStakeManager.compoundRewards() runs once a day: it books the BSC staking rewards earned by the
// pool (totalProfit), takes fee = max(totalProfit * synFee, totalDelegated * annualRate / 365) as the
// protocol commission (minted as slisBNB to revenuePool) and emits RewardsCompounded(fee) in BNB.
// Revenue below is that exact fee; gross rewards are derived as fee / synFee, which is exact whenever
// the profit-based branch binds (every day in Aug-2026).
//
// The commission is read from this event rather than inferred from the slisBNB exchange-rate move,
// because the rate also rises for two reasons that are not staking rewards and carry no fee:
// (1) the validator-commission refund that RefundCommission deposits and compoundRewards burns back to
//     holders day by day, and
// (2) rewards accrued on shares awaiting withdrawal, which ClaimUndelegatedFrom leaves with the
//     remaining holders.
// Inferring from the rate overstated Revenue by ~3.5% in Aug-2026 versus the fee actually minted.
const REWARDS_COMPOUNDED = "event RewardsCompounded(uint256 _amount)";

const fetch = async (options: FetchOptions) => {
  const logs = await options.getLogs({
    target: ListaStakeManagerAddress,
    eventAbi: REWARDS_COMPOUNDED,
  });

  // Commission rate is configurable on-chain (ListaStakeManager.synFee, 1e10 precision).
  const synFee = await options.toApi.call({
    target: ListaStakeManagerAddress,
    abi: 'uint256:synFee',
  });
  const commissionRate = Number(synFee) / 1e10;
  if (commissionRate <= 0 || commissionRate >= 1) throw new Error(`Invalid synFee: ${synFee}`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  for (const log of logs) {
    const commission = Number(log._amount) / 1e18; // BNB kept by the protocol in this compound run
    const rewards = commission / commissionRate; // total staking rewards compounded in this run
    dailyFees.addCGToken("binancecoin", rewards, 'BNB Staking Rewards');
    dailyRevenue.addCGToken("binancecoin", commission, 'BNB Staking Rewards Commission');
    dailySupplySideRevenue.addCGToken("binancecoin", rewards - commission, 'BNB Staking Rewards To Stakers');
  }

  const dailyHoldersRevenue = dailyRevenue.clone(0.3, 'Token Buy Back'); // 30% of commission buys back LISTA
  const dailyProtocolRevenue = dailyRevenue.clone(0.7, 'BNB Staking Rewards Commission'); // 70% to treasury

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};
const methodology = {
  Fees: 'Total yields from staked BNB.',
  Revenue: 'Lista DAO charges a commission (ListaStakeManager.synFee) on the staking yields, read from the daily RewardsCompounded event, i.e. the commission actually minted to revenuePool.',
  ProtocolRevenue: '70% of the commission is retained by the treasury.',
  HoldersRevenue: '30% of the commission is used to buy back LISTA.',
  SupplySideRevenue: 'Stakers earn the staking rewards net of the commission.',
}
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: '2023-08-30',
    },
  },
  pullHourly: true,
  methodology,
  breakdownMethodology: {
    Fees: {
      'BNB Staking Rewards': 'Total BNB staking rewards collected by running BSC validators.',
    },
    Revenue: {
      'BNB Staking Rewards Commission': 'Commission actually taken on each compoundRewards run (RewardsCompounded._amount).',
    },
    ProtocolRevenue: {
      'BNB Staking Rewards Commission': '70% of the commission is retained by the treasury.',
    },
    SupplySideRevenue: {
      'BNB Staking Rewards To Stakers': 'Stakers earn the staking rewards net of the commission.',
    },
    HoldersRevenue: {
      'Token Buy Back': '30% of the commission is used to buy back LISTA.',
    },
  }
};

export default adapter;
