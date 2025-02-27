import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const VotingEscrows = {
    USD: "0x0966CAE7338518961c2d35493D3EB481A75bb86B",
    ETH: "0x1Ec2b9a77A7226ACD457954820197F89B3E3a578",
    BTC: "0x7585D9C32Db1528cEAE4770Fd1d01B888F5afA9e"
};

const VotingEscrowAbi = [{
    "constant": true,
    "inputs": [],
    "name": "voter",
    "outputs": [
        {
            "internalType": "address",
            "name": "",
            "type": "address"
        }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
}] as const;
const VoterAbi = [{"inputs":[],"name":"baseAsset","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}, {"inputs":[{"internalType":"uint256","name":"","type":"uint256"}],"name":"periodBudget","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"}] as const;

const PERIOD_DURATION = 604800;

const fetch: any = async ({ createBalances, api }: FetchOptions) => {
  const dailyRevenue = createBalances();

  const period = (Math.floor(Date.now() / 1000 / PERIOD_DURATION)) * PERIOD_DURATION + PERIOD_DURATION;

  for (const ve of Object.values(VotingEscrows)) {
    const voter = await api.call({
      target: ve,
        abi: VotingEscrowAbi.find(abi => abi.name === 'voter'),
    });
    const periodBudget = await api.call({
        target: voter,
        abi: VoterAbi.find(abi => abi.name === 'periodBudget'),
        params: [period]
    });
    const baseAsset = await api.call({
        target: voter,
        abi: VoterAbi.find(abi => abi.name === 'baseAsset'),
    });

    dailyRevenue.add(baseAsset, periodBudget / 7);
  }

  // Daily fees are 10% on top of daily revenue
  const dailyFees = createBalances();
  dailyFees.addUSDValue((await dailyRevenue.getUSDValue()) * (100 / 90))

  return { dailyFees, dailyRevenue, };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-01-21',
      meta: {
        methodology: 'We calculate the fees added to the voters of each ve contracts then we add 10% on top of the daily revenue.',
      }
    },
  },
};

export default adapter;
