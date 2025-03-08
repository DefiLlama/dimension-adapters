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
const VoterAbi = [{"inputs":[],"name":"baseAsset","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"}] as const;

const fetch: any = async ({ createBalances, getLogs, api }: FetchOptions) => {
  const dailyFees = createBalances();

  for (const ve of Object.values(VotingEscrows)) {
    const voter = await api.call({
      target: ve,
        abi: VotingEscrowAbi.find(abi => abi.name === 'voter'),
    });
    const baseAsset = await api.call({
        target: voter,
        abi: VoterAbi.find(abi => abi.name === 'baseAsset'),
    });
    const logs = await getLogs({
      targets: [voter],
      eventAbi: "event BudgetDeposited(address indexed depositor, uint256 indexed period, uint256 amount)",
    });

    for (const log of logs) {
      dailyFees.add(baseAsset, log.amount);
    }
  }
  return { dailyFees };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: '2025-01-21',
      meta: {
        methodology: 'We calculate the fees added to the voters of each ve contracts',
      }
    },
  },
};

export default adapter;
