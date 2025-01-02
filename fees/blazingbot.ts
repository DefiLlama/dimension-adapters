import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fethcFeesSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '4TTaKEKLjh1WJZttu1kvDtZt9N4G854C6ZKPAprZFRuy' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const v2_contract_address: any = {
  [CHAIN.BSC]: '0xfdb7eF80BD6aB675CD52811BfB9329FbD9B92aBA',
  [CHAIN.BASE]: '0x6882912e2580471E5ac7a928a4f52F0bD2701810',
  [CHAIN.ETHEREUM]: '0xfdb7ef80bd6ab675cd52811bfb9329fbd9b92aba',
  [CHAIN.SONIC]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
}

const v3_contract_address: any = {
  [CHAIN.BSC]: '0xB23495f9a4807cD7672f382B9b0c2a3A0ec78649',
  [CHAIN.BASE]: '0xE47809790a0cE703c2AC81598c90d5cC1569675d',
  [CHAIN.ETHEREUM]: '0x196f75367A9286E039C6CFEBa5B8686ed84cBa68',
  [CHAIN.SONIC]: '0xB23495f9a4807cD7672f382B9b0c2a3A0ec78649',
}

const virtual_contract_address: any = {
  [CHAIN.BASE]: '0x803A70b24062e429Ce48801a0fAb6B13a994A454',
}

const fetchFees = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const logsV2 = await options.getLogs({
    topic: '0xac73d170101ac263d42f3626a4a5142cdae6d109e48d6310c276b1fd1f5f3854',
    target: v2_contract_address[options.chain],
  });

  logsV2.map((log: any) => {
    dailyFees.addGasToken(Number(log.data));
    dailyRevenue.addGasToken(Number(log.data));
  });

  const logsV3 = await options.getLogs({
    topic: '0xac73d170101ac263d42f3626a4a5142cdae6d109e48d6310c276b1fd1f5f3854',
    target: v3_contract_address[options.chain],
  });

  logsV3.map((log: any) => {
    dailyFees.addGasToken(Number(log.data));
    dailyRevenue.addGasToken(Number(log.data));
  });

  if (options.chain === CHAIN.BASE) {
    const logsVirtual = await options.getLogs({
      topic: '0xac73d170101ac263d42f3626a4a5142cdae6d109e48d6310c276b1fd1f5f3854',
      target: virtual_contract_address[options.chain],
    });

    logsVirtual.map((log: any) => {
      dailyFees.addGasToken(Number(log.data));
      dailyRevenue.addGasToken(Number(log.data));
    });
  }

  console.log("Daily fees: ", dailyFees);
  console.log("Daily revenue: ", dailyRevenue);

  return {
    dailyFees: dailyFees,
    dailyRevenue: dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: '2024-03-01',
    },
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2024-03-01',
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-03-01',
    },
    [CHAIN.SONIC]: {
      fetch: fetchFees,
      start: '2024-12-15',
    },
    [CHAIN.SOLANA]: {
      fetch: fethcFeesSolana,
      runAtCurrTime: true,
      start: '2024-11-23',
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;