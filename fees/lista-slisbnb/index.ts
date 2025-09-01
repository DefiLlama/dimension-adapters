import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const treasury = "0x8d388136d578dCD791D081c6042284CED6d9B0c6";

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
  const dailyFees = options.createBalances();

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

  const dailySlisbnbHoldersYield = (pooledBnbAfter / slisBnbSupplyAfter - pooledBnbBefore / slilsBnbSupplyBefore) * (slisBnbSupplyAfter / 1e18);
 
  dailyFees.addCGToken("binancecoin", dailySlisbnbHoldersYield/0.95);

  return {
    dailyFees,
    dailyRevenue: dailyFees.clone(0.05),
    dailyProtocolRevenue: dailyFees.clone(0.05),
  };
};
const methodology = {
  Fees: 'Total yields from staked BNB.',
  Revenue: '5 % of the total yields are charged by Lista DAO.',
  ProtocolRevenue: 'All revenue goes to the protocol'

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
};

export default adapter;
