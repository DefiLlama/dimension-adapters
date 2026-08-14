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

// token
const slisBNB = "0xb0b84d294e0c75a6abe60171b70edeb2efd14a1b";

const fetch = async (options: FetchOptions) => {
  const slilsBnbSupplyBefore = await options.fromApi.call({
    target: slisBNB,
    abi: 'uint256:totalSupply',
  });

  const slisBnbSupplyAfter = await options.toApi.call({
    target: slisBNB,
    abi: 'uint256:totalSupply',
  });

  const pooledBnbBefore = await options.fromApi.call({
    target: ListaStakeManagerAddress,
    abi: 'uint256:getTotalPooledBnb',
  });

  const pooledBnbAfter = await options.toApi.call({
    target: ListaStakeManagerAddress,
    abi: 'uint256:getTotalPooledBnb',
  });

  // staking rewards distributed post revenue cut
  const supplySideRewards = (pooledBnbAfter / slisBnbSupplyAfter - pooledBnbBefore / slilsBnbSupplyBefore) * (slisBnbSupplyAfter / 1e18);

  // Commission rate is configurable on-chain (ListaStakeManager.synFee, 1e10 precision).
  // Read it live instead of hardcoding: it was 5% historically and is 15% as of 2026-08.
  const synFee = await options.toApi.call({
    target: ListaStakeManagerAddress,
    abi: 'uint256:synFee',
  });
  const commissionRate = Number(synFee) / 1e10;
  const supplyRate = 1 - commissionRate;
  if (supplyRate <= 0) throw new Error(`Invalid synFee (commission >= 100%): ${synFee}`);

  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addCGToken("binancecoin", supplySideRewards / supplyRate, 'BNB Staking Rewards');
  dailySupplySideRevenue.addCGToken("binancecoin", supplySideRewards, 'BNB Staking Rewards To Stakers');

  const dailyRevenue = dailyFees.clone(commissionRate, 'BNB Staking Rewards Commission');
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
  Revenue: 'Lista DAO charges a commission on the staking yields (rate read on-chain from ListaStakeManager.synFee; currently 15%).',
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
  methodology,
  breakdownMethodology: {
    Fees: {
      'BNB Staking Rewards': 'Total BNB staking rewards collected by running BSC validators.',
    },
    Revenue: {
      'BNB Staking Rewards Commission': 'Commission charged on staking rewards (synFee, read on-chain; currently 15%).',
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
