import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { addTokensReceived } from "../../helpers/token";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
// 0xd4627eCb405B64448EE6B07dcf860BF55590c83D - Fee Wallet

const chainSettings: any = {
  base: {
    factory: '0x71D234A3e1dfC161cc1d081E6496e76627baAc31',
    fromBlock: 12116234,
    chainName: 'base',
    dune_chainName: 'base',
  },
  optimism: {
    factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
    fromBlock: 117753454,
    chainName: 'optimism',
    dune_chainName: 'optimism',
  },
  arbitrum: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    fromBlockSickle: 197499243,
    chainName: 'arbitrum',
    dune_chainName: 'arbitrum',
  },
  linea: {
    factory: '0x0F6aBc6B808B377d6AeD8dA1FAD5E135C99C81a3',
    fromBlockSickle: 4949355,
    chainName: 'linea',
    dune_chainName: 'linea',
  },
  ethereum: {
    factory: '0x9D70B9E5ac2862C405D64A0193b4A4757Aab7F95',
    chainName: 'ethereum',
    dune_chainName: 'ethereum',
    fromBlockSickle: 19580798,
  },
  mode: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'mode',
    dune_chainName: 'mode',
    fromBlockSickle: 7464171,
  },
  fantom: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'fantom',
    dune_chainName: 'fantom',
    fromBlockSickle: 79166260,
  },
  mantle: {
    factory: '0xB4C31b0f0B76b351395D4aCC94A54dD4e6fbA1E8',
    chainName: 'mantle',
    dune_chainName: 'mantle',
    fromBlockSickle: 62383980,
  },
  bsc: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'bsc',
    dune_chainName: 'bnb',
    fromBlockSickle: 37565801
  },
  sonic: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'sonic',
    dune_chainName: 'sonic',
    fromBlockSickle: 1449481
  },
  // fraxtal: {
  //   factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
  //   chainName: 'fraxtal',
  //   fromBlockSickle: 13191747
  // },
  avax: {
    factory: '0x53d9780DbD3831E3A797Fd215be4131636cD5FDf',
    chainName: 'avax',
    dune_chainName: 'avalanche_c',
    fromBlockSickle: 52924795
  },
};

const FeeWallet = "0xd4627eCb405B64448EE6B07dcf860BF55590c83D";

const fetchFees = async (_t: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const settings = chainSettings[options.chain];

  const res = await queryDuneSql(options, `
      WITH logs AS (
        select
            tx_hash,
            block_time,
            bytearray_to_uint256(substr(data, 65, 32)) as amount,
            varbinary_ltrim(substr(data, 97, 32)) as token
        from ${settings.dune_chainName}.logs
        where topic0 = 0x20637f693d80799c8bf08f5bf9614910f0106e0f0d787852fcd247b514b5f1ee
        and block_time >= from_unixtime(${options.startTimestamp})
        and block_time < from_unixtime(${options.endTimestamp})
    )
    select 
        token,
        sum(amount) as total_amount
    from logs
    group by 1
  `);

  res.forEach((item: any) => {
    dailyFees.add(item.token, Number(item.total_amount));
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
  }

  // /*     // Fetch Deploy events to get all Sickle contract addresses
  //     const deployLogs = await getLogs({
  //       target: settings.factory,
  //       fromBlock: settings.fromBlock,
  //       eventAbi: 'event Deploy(address indexed admin, address sickle)',
  //       cacheInCloud: true,
  //     });
  
  //     const sickleContracts = deployLogs.map((log: any) => log.sickle); */

  // const logs = await options.getLogs({
  //   // targets: sickleContracts,
  //   eventAbi: 'event FeeCharged(bytes32 feesHash, uint256 amount, address token)',
  // });

  // const logs2 = await options.getLogs({
  //   // targets: sickleContracts,
  //   eventAbi: 'event FeeCharged(address strategy, bytes4 feeDescriptor, uint256 amount, address token)',
  // });


  // logs.forEach((log: any) => {
  //   dailyFees.add(log.token, log.amount);
  // });

  // logs2.forEach((log: any) => {
  //   dailyFees.add(log.token, log.amount);
  // });

  // return {
  //   dailyFees,
  //   dailyRevenue: dailyFees,
  // };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.BASE]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.LINEA]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.MODE]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.FANTOM]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.MANTLE]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.BSC]: {
      fetch: fetchFees,
      start: '2024-03-21',
    },
    [CHAIN.SONIC]: {
      fetch: fetchFees,
      start: '2024-12-24',
    },
    // [CHAIN.FRAXTAL]: {
    //   fetch: fetchFees,
    //   start: '2024-12-03',
    // },
    [CHAIN.AVAX]: {
      fetch: fetchFees,
      start: '2024-11-11',
    },
  }
}

export default adapter;
