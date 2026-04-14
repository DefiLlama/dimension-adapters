import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const CHAIN_TO_DUNE_MAPPING: Record<string, string> = {
  [CHAIN.BSC]: 'bnb',
  [CHAIN.BASE]: 'base',
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.AVAX]: 'avalanche_c',
  [CHAIN.ARBITRUM]: 'arbitrum',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.MONAD]: 'monad',
};

const prefetch = async (options: FetchOptions) => {
  const query = `
    WITH ux_userops AS (
      SELECT
          tx_hash,
          blockchain,
          sender                          AS ua_address   -- UA smart-wallet = user identity
      FROM account_abstraction_erc4337.userops
      WHERE block_month  >= DATE '2026-01-01'
        AND TIME_RANGE
        AND success        = TRUE
        AND blockchain IN (
          'base','bnb','arbitrum','optimism','blast',
          'linea','polygon','avalanche_c','sonic','berachain','ethereum', 'monad'
        )
        AND bundler IN (
          -- Particle Network / UniversalX bundler signers
          -- (sourced from official Particle Network Dune pipeline, query_4949242)
          0x596680F2ea1Bdb041570C74FB5fc8C0c0a9Fad80,
          0x7F0Fa0BAB21c6749F12116aA8CBAB7bBaE8f50F2,
          0x432C961E222FC3522FD31af85E84C6240fF0b46F,
          0xc389179b875d3e0586D8e7903Fe1E8dE474C44Da,
          0x71320c9382addB244CED08Db58eF761186a63cc3,
          0x74Bf7407Dd5fa033e51120f87246aCE3b75B32d0,
          0x9E375d31A8d0Ed88d0EdE9C7a3f775965d9442f2,
          0xb0c58bE75936250B2b14C8437614FF780E902F57,
          0xCfA706659D0bBe85EbB5C145a2D9f1c89C76b1c4,
          0xf7e017b3f61bD3410A3b03D7DAD7699FD6780584,
          0xDfFbb5B47704896eA9017D7003a1f75Cd62ea4f2,
          0x19903192Ea0128D9af2bc3Db15cc6900Bd605eB0,
          0x6D40C3F90371b6D2a2a7D336947d417c11aAed2a,
          0xE58b318D8a37c53F86534a33BfAeefeA4Bba1111,
          0xB41C03f8457cBD9D12f34dC449B50D8244076CBF,
          0xD44A59e1E333430aB20D330cAd9C5800A3317d2b,
          0xB9aeFac2E20d2C63b2bECCF8bC85C68f81c82f1c,
          0x1A1c0Ad7bE7760f40e0bB5aB78Fc7288C40a6c2b,
          0x032160D97A923A3B55C98E04c871212Ac8A48974,
          0x722606EB3bDA03e80C5Ed747732DAC00b8CDE824,
          0x6EEf4AF735027cFEb3Cd3628201Cd5fC5F51914a,
          0xfb2f1eeE510F12F8E72F55c56d6F12A7183993eE,
          0x042D15997e8c1e03f0AbB43CE2f4B6617D73780C,
          0xE26b72eBc3738DF3f5b6258d16E1cB32Afd1E848,
          0xA23c9035AfD3e34690d80804B33Bdf1b93c0A604,
          0x75727f24665A23f862161297870798056eb61dB1,
          0x85A582A123D2AC79F143d9c0A5b2baD1C7D8B1Af,
          0xA8A4afBbFcF08B46249A48Bd73d2C85cCe525190,
          0xC89d07eCB919103e37945C22474e982cb2616Ba3,
          0x9E63DBB321E950AA128383596ACE54A4Ec67AE9E,
          0x4574E1c02b90e1Ac12baB6944A24D83a1edED5B4,
          0x204a72835eD0Ce927A5a663adEBAD3D86445D477,
          0xcB4e642d7D26f82eFd73020436a4b1E983f4DbFA,
          0x6db893A14498270a3cDea2dbcc0Bb34593dEa71a,
          0xf7D644Ad4CF2C1d1ED924556385522E530367bF1,
          0x027037e2D7199C856F78A22E6c5bD60188C6034E,
          0xC6cDF744C7b40E71C16cA7E5286e8c5E39fA6CaF,
          0x529565b3fE0a03Ff81f52f8E53B9Fa8812F436D9,
          0xF801672Ed1C5c26e99879296058C31765aEB40AE,
          0x5F64DF785fBe01Bf97A69da6EE3A48b8aEa36f46,
          0x25918A864efAfec281173aE90cbCDb9Da850FEe8,
          0xed1bE395CEa4f25f2786c4664A6C0d7f2ef95c6C,
          0x1C91AF3c1851c529644c59eeaDfCc7e359879E05,
          0x5ff6c7732548cd2c1F3BC6b7C0B084748498de6F,
          0x7782e0b536f1835E192434DFE6F4c3a6633664Fd,
          0xd1b3D51EAd4B0880eD37448e393873cC67D77641,
          0xed1F8fA2E386a74a6E88be2800cd5a1829fBC923,
          0x138FF91D402f6a54CE159f63C87721e385e7AC7f,
          0xe60767079edd05D31Cf5Bb60dC6885418F4350E9,
          0xB0E113fc2E9740e33538aCFF1F08df9eBCc24280
        )
    ),

    -- Step 2: Join with dex.trades on tx_hash to get swap volume
    -- block_date filter on dex.trades enables partition pruning
    ux_trade_volume AS (
        SELECT
            u.blockchain AS blockchain,
            COALESCE(SUM(t.amount_usd), 0)  AS tx_volume_usd
        FROM ux_userops u
        LEFT JOIN dex.trades t
              ON t.tx_hash    = u.tx_hash
              AND t.blockchain = u.blockchain
              AND t.block_time >= from_unixtime(${options.startTimestamp})
              AND t.block_time <= from_unixtime(${options.endTimestamp})
        GROUP BY u.blockchain
    )

    -- Step 3: Daily aggregation
    SELECT
        blockchain                                     AS blockchain,
        ROUND(SUM(tx_volume_usd) * 0.01, 2)            AS daily_fees_usd
    FROM ux_trade_volume
    GROUP BY blockchain
  `
  return await queryDuneSql(options, query);
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const data = await options.preFetchedResults;
  const dailyFees = options.createBalances();
  let fees = 0;
  data.forEach((result: any) => {
    if (result.blockchain === CHAIN_TO_DUNE_MAPPING[options.chain]) {
      fees += result.daily_fees_usd;
    }
  });
  dailyFees.addUSDValue(fees || 0, METRIC.TRADING_FEES);
  return { dailyFees, dailyRevenue: dailyFees };
};

const adapter: SimpleAdapter = {
  prefetch,
  fetch,
  start: '2026-01-01',
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.BSC, CHAIN.BASE, CHAIN.ETHEREUM, CHAIN.AVAX, CHAIN.ARBITRUM, CHAIN.POLYGON, CHAIN.OPTIMISM, CHAIN.MONAD],
  methodology: {
    Fees: "1% of volume fees collected by universalX",
    Revenue: "1% of volume fees collected by universalX"
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRADING_FEES]: "1% of volume fees collected by universalX, they also share 50% of fees with referrals"
    }
  }
};

export default adapter;
