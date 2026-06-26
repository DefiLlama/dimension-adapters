import { SimpleAdapter, FetchOptions, FetchResult, Dependencies } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { addTokensReceived } from "../../helpers/token";
import ADDRESSES from '../../helpers/coreAssets.json'
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

const TREASURY_ADDRESS = '0x245db945c485b68fdc429e4f7085a1761aa4d45d';
const MARKETPLACE_ADDRESS = '0x3b3adf1422f84254b7fbb0e7ca62bd0865133fe3';
const PROTOCOL_FEE = 0.0425; // 4.25% protocol fee
const CREATOR_FEE = 0.01; // 1% creator fee
const TREASURY_MIGRATION = 1682553600 // 2023-04-27

async function fetchHistoricalRonin(options: FetchOptions): Promise<FetchResult> {
  // https://blog.axieinfinity.com/p/the-community-treasury-an-overview
  const HISTORICAL_TREASURY = '0xa99cacd1427f493a95b585a5c7989a08c86a616b';

  // Ronin token address -> ethereum address (pricing on ronin starts ~2024)
  const RONIN_TOKEN_PRICING: Record<string, string> = {
    [ADDRESSES.ronin.AXS]: '0xbb0e17ef65f82ab018d8edd776e8dd940327b28b',
    [ADDRESSES.ronin.WETH]: ADDRESSES.ethereum.WETH,
    [ADDRESSES.ronin.USDC]: ADDRESSES.ethereum.USDC,
  };

  const dailyFees = options.createBalances();
  const tokenList = Object.keys(RONIN_TOKEN_PRICING).join(', ');
  const treasuryTopic = '0x' + HISTORICAL_TREASURY.slice(2).padStart(64, '0');

  const query = `
    SELECT
      to_hex(contract_address) AS token,
      CAST(SUM(CAST(bytearray_to_uint256(data) AS DECIMAL(38, 0))) AS VARCHAR) AS total_wei
    FROM ronin.logs
    WHERE contract_address IN (${tokenList})
      AND topic0 = 0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef
      AND topic2 = ${treasuryTopic}
      AND block_time >= from_unixtime(${options.fromTimestamp})
      AND block_time <  from_unixtime(${options.toTimestamp})
    GROUP BY 1
    `;
  const rows = await queryDuneSql(options, query);
  for (const row of rows) {
    const mapped = RONIN_TOKEN_PRICING['0x' + row.token.toLowerCase()];
    if (!mapped) continue;
    dailyFees.add(mapped, BigInt(row.total_wei), { skipChain: true, label: METRIC.PROTOCOL_FEES });
  }
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

async function fetchHistoricalEth(options: FetchOptions): Promise<FetchResult> {
  const ETH_CLOCK_AUCTION = '0xF4985070Ce32b6B1994329DF787D1aCc9a2dd9e2'
  const AUCTION_SUCESSFULL = 'event AuctionSuccessful(address indexed _nftAddress, uint256 indexed _tokenId, uint256 _totalPrice, address _winner)'

  const dailyFees = options.createBalances()
  const logs = await options.getLogs({ target: ETH_CLOCK_AUCTION, eventAbi: AUCTION_SUCESSFULL })
  for (const log of logs) {
    const fee = BigInt(log._totalPrice) * 425n / 10000n; // 4.25%
    dailyFees.addGasToken(fee, METRIC.PROTOCOL_FEES);
  }
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees };
}

const fetch = async (options: FetchOptions) => {
  if (options.startTimestamp < TREASURY_MIGRATION) return options.chain === CHAIN.RONIN
    ? fetchHistoricalRonin(options)
    : fetchHistoricalEth(options)
  const dailyProtocolRevenue = await addTokensReceived({
    options,
    tokens: [ADDRESSES.ronin.AXS, ADDRESSES.null,
    ADDRESSES.ronin.WETH, ADDRESSES.ronin.USDC],
    target: TREASURY_ADDRESS,
  });

  const dailyMarketplaceProtocolRevenue = await addTokensReceived({
    options,
    fromAdddesses: [MARKETPLACE_ADDRESS],
    tokens: [ADDRESSES.ronin.WETH],
    target: TREASURY_ADDRESS,
  });

  let dailyCreatorsRevenue = dailyMarketplaceProtocolRevenue.clone(CREATOR_FEE / PROTOCOL_FEE, METRIC.CREATOR_FEES);

  let dailyFees = dailyProtocolRevenue.clone(1, METRIC.PROTOCOL_FEES);
  dailyFees.addBalances(dailyCreatorsRevenue);

  return {
    dailyFees,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
}

const methodology = {
  Fees: 'All fees paid axie infinity users trading on marketplace and other in-game activities.',
  Revenue: 'Fees collected by the protocol post creator fee reduction.',
  ProtocolRevenue: 'All the revenue goes to protocol treasury',
};

const breakdownMethodology = {
  Fees: {
    [METRIC.PROTOCOL_FEES]: 'Marketplace fees (4.25%) collected by the protocol treasury from NFT trades on Axie marketplace and in-game activities',
    [METRIC.CREATOR_FEES]: 'Creator royalty fees (1%) paid to NFT creators from marketplace trades',
  },
  Revenue: {
    [METRIC.PROTOCOL_FEES]: 'All marketplace fees retained by the protocol treasury after excluding creator royalties',
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_FEES]: 'All marketplace fees retained by the protocol treasury after excluding creator royalties',
  },
};

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: {
    [CHAIN.RONIN]: { start: '2021-04-26' },
    [CHAIN.ETHEREUM]: { start: '2018-03-25', deadFrom: '2021-04-30' },
  },
  dependencies: [Dependencies.DUNE],
  methodology,
  breakdownMethodology,
};

export default adapters;
