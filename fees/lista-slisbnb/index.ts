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

  const logs_reward = await options.getLogs({
    target: ListaStakeManagerAddress,
    eventAbi: "event RewardsCompounded(uint256 _amount)",
  });

  logs_reward.forEach((log) => {
    const amount = log._amount;
    dailyFees.add(slisBNB, amount);
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1693361953,
    },
  },
};

export default adapter;
