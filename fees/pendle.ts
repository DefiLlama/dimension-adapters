import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";
import { addTokensReceived } from "../helpers/token";
import { getTxReceiptsWithRetry } from "../helpers/getTxReceipts";
import BigNumber from "bignumber.js";
import { getConfig } from "../helpers/cache";
import { ChainApi } from "@defillama/sdk";

const ABI = {
  assetInfo: "function assetInfo() view returns (uint8,address,uint8)",
  getRewardTokens: "function getRewardTokens() view returns (address[])",
  exchangeRate: "function exchangeRate() view returns (uint256)",
  marketSwapEvent: "event Swap(address indexed caller, address indexed receiver, int256 netPtOut, int256 netSyOut, uint256 netSyFee, uint256 netSyToReserve)",
};

type IConfig = {
  [s: string | Chain]: {
    treasury: string;
    blacklists?: Array<string>;
    airdropFunders?: Array<string>;
    usdtAddress?: string;
  };
};

const STETH_ETHEREUM = "ethereum:" + ADDRESSES.ethereum.STETH;
const EETH_ETHEREUM = "ethereum:" + ADDRESSES.ethereum.EETH;
const WETH_ETHEREUM = "ethereum:" + ADDRESSES.ethereum.WETH;

const AIRDROP_DISTRIBUTOR = '0x3942F7B55094250644cFfDa7160226Caa349A38E'

// sPendle and pendlePtLooper in Pendle's deployments/1-core.json. The looper has the same address on every chain it is on.
const SPENDLE = '0x999999999991E178D52Cd95AFd4b00d066664144'
const PENDLE = '0x808507121b80c02388fad14726482e061b8da827'
const PT_LOOPER = '0xF82Ef4080A53b71093f9c470676Fc80E2ADC4263'
const EXIT_FEES_LABEL = 'sPENDLE Instant Exit Fees'
const LOOPER_FEES_LABEL = 'PT Looper Service Fees And Gas'
const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const LOOPER_POSITION_EVENTS = [
  'event PositionIncreased(address indexed owner, bytes32 indexed boxId, bytes32 requestHash, uint256 nonce, uint256 preInBalance, uint256 netPtToMM, uint256 postDebtBalance)',
  'event PositionDecreased(address indexed owner, bytes32 indexed boxId, bytes32 requestHash, uint256 nonce, uint256 preDebtBalance, uint256 netPtToSwap, uint256 postDebtBalance)',
]

const BRIDGED_ASSETS = [
  {
    sy: "0x80c12d5b6cc494632bf11b03f09436c8b61cc5df",
    asset: STETH_ETHEREUM,
  },
  {
    sy: "0x96a528f4414ac3ccd21342996c93f2ecdec24286",
    asset: STETH_ETHEREUM,
  },
  {
    sy: "0xa6c895eb332e91c5b3d00b7baeeaae478cc502da",
    asset: EETH_ETHEREUM,
  },
  {
    sy: "0x9d6d509c0354aca187aac6bea7d063d3ef68e2a0",
    asset: WETH_ETHEREUM,
  },
];

const chainConfig: IConfig = {
  [CHAIN.ETHEREUM]: {
    treasury: "0x8270400d528c34e1596ef367eedec99080a1b592",
    blacklists: [
      '0xe2796707590384430d887f15bdf97c660d95894a',
    ],
    airdropFunders: [
      "0x096FBee7b8DFb88993A94c6145211163D2616245",
      "0xeea6F790F18563E91b18DF00B89d9f79b2E6761F",
    ],
    usdtAddress: ADDRESSES.ethereum.USDT
  },
  [CHAIN.ARBITRUM]: {
    treasury: "0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6",
    airdropFunders: ["0x096FBee7b8DFb88993A94c6145211163D2616245"],
    usdtAddress: ADDRESSES.arbitrum.USDT
  },
  [CHAIN.BSC]: {
    treasury: "0xd77e9062c6df3f2d1cb5bf45855fa1e7712a059e",
    usdtAddress: ADDRESSES.bsc.USDT
  },
  [CHAIN.OPTIMISM]: {
    treasury: "0xe972d450ec5b11b99d97760422e0e054afbc8042",
    usdtAddress: ADDRESSES.optimism.USDT
  },
  [CHAIN.MANTLE]: {
    treasury: "0x5c30d3578a4d07a340650a76b9ae5df20d5bdf55",
    usdtAddress: ADDRESSES.mantle.USDT
  },
  [CHAIN.BASE]: {
    treasury: "0xcbcb48e22622a3778b6f14c2f5d258ba026b05e6",
    usdtAddress: ADDRESSES.base.USDT
  },
  [CHAIN.SONIC]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
    usdtAddress: ADDRESSES.sonic.USDT
  },
  [CHAIN.BERACHAIN]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
    usdtAddress: ADDRESSES.xlayer.USDT0
  }, 
  [CHAIN.PLASMA]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
    usdtAddress: ADDRESSES.corn.USDT0
  },
  [CHAIN.HYPERLIQUID]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
    airdropFunders: ["0xeea6F790F18563E91b18DF00B89d9f79b2E6761F"],
    usdtAddress: ADDRESSES.corn.USDT0
  },
  [CHAIN.MONAD]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
    usdtAddress: ADDRESSES.flare.USDT0
  },
  [CHAIN.XLAYER]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
    usdtAddress: ADDRESSES.xlayer.USDT
  },
  [CHAIN.ROBINHOOD]: {
    treasury: "0xCbcb48e22622a3778b6F14C2f5d258Ba026b05e6",
  }
};

const fetch = async (options: FetchOptions) => {
  const { chain } = options;
  const { api, getLogs } = options;

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const { markets, sys, marketToSy } = await getWhitelistedAssets(api);

  if (!markets.length) {
    return {
      dailyFees,
      dailyRevenue: options.createBalances(),
      dailyProtocolRevenue: options.createBalances(),
      dailyHoldersRevenue: options.createBalances(),
      dailySupplySideRevenue,
    };
  }

  const rewardTokens: string[] = (
    await api.multiCall({
      permitFailure: true,
      abi: ABI.getRewardTokens,
      calls: sys,
    })
  ).flat();

  const exchangeRates: String | null[] = [];
  const assetInfos: (string[] | null)[] = [];
  for (const sy of sys) {
    try {
      const exchangeRate = await api.call({
        target: sy,
        abi: ABI.exchangeRate,
      });
      const assetInfo = await api.call({ target: sy, abi: ABI.assetInfo });
      exchangeRates.push(exchangeRate);
      assetInfos.push(assetInfo);
    } catch (e) {
      exchangeRates.push(null);
      assetInfos.push(null);
    }
  }

  const allSwapEvents = await getLogs({
    targets: markets,
    eventAbi: ABI.marketSwapEvent,
    flatten: false,
  });

  markets.forEach((market, i) => {
    const token = marketToSy.get(market);
    const logs = allSwapEvents[i]
    logs.forEach((log: any) => {
      const netSyFee = log.netSyFee;
      const netSyToReserve = log.netSyToReserve;
      dailySupplySideRevenue.add(token!, netSyFee - netSyToReserve, 'AMM Swap Fees To LPs'); // excluding revenue fee
    })
  })


  const treasuryInflows = await addTokensReceived({
    options,
    target: chainConfig[chain].treasury,
    tokens: rewardTokens.concat(sys),
  });

  const allRevenueTokenList = treasuryInflows.getBalances();
  const allSupplySideTokenList = dailySupplySideRevenue.getBalances();

  for (const token in allRevenueTokenList) {
    const tokenAddr = token.split(":")[1];
    const index = sys.indexOf(tokenAddr);

    if (chainConfig[options.chain].blacklists && chainConfig[options.chain].blacklists?.includes(tokenAddr)) continue;

    if (index == -1 || !assetInfos[index]) continue;

    const assetInfo = assetInfos[index]!;

    const rawAmountRevenue = allRevenueTokenList[token];
    const rawAmountSupplySide = allSupplySideTokenList[token];

    treasuryInflows.removeTokenBalance(token);
    dailySupplySideRevenue.removeTokenBalance(token);

    let underlyingAsset = assetInfo[1]!;

    let isBridged = false;
    for (const bridge of BRIDGED_ASSETS) {
      if (bridge.sy === tokenAddr) {
        underlyingAsset = bridge.asset;
        isBridged = true;
        break;
      }
    }

    let assetAmountRevenue = new BigNumber(rawAmountRevenue);
    let assetAmountSupplySide = new BigNumber(rawAmountSupplySide);
    if (assetInfo[0] === "0") {
      const rate = exchangeRates[index] ?? 0;
      assetAmountRevenue = assetAmountRevenue
        .times(rate)
        .dividedToIntegerBy(1e18);
      assetAmountSupplySide = assetAmountSupplySide
        .times(rate)
        .dividedToIntegerBy(1e18);
    }

    treasuryInflows.addToken(
      underlyingAsset,
      assetAmountRevenue,
      isBridged
        ? {
          skipChain: true,
        }
        : undefined
    );

    if (rawAmountSupplySide !== undefined) {
      dailySupplySideRevenue.addToken(
        underlyingAsset,
        assetAmountSupplySide,
        isBridged
          ? { skipChain: true, label: 'AMM Swap Fees To LPs' }
          : { label: 'AMM Swap Fees To LPs' }
      );
    }
  }

  // these revenue should be counted in fees too
  // Only track tokens sent from addresses funded by the pendle deployer to the airdrop distributor, matching Pendle's Dune query
  let tokenToDistributor = options.createBalances()
  const sources = [chainConfig[chain].treasury, ...(chainConfig[chain].airdropFunders ?? [])]
  tokenToDistributor = await addTokensReceived({
    options,
    target: AIRDROP_DISTRIBUTOR,
    fromAdddesses: sources,
  })

  if (chainConfig[chain].usdtAddress) tokenToDistributor.removeTokenBalance(chainConfig[chain].usdtAddress!) // ignore USDT airdrop
  // sPENDLE from these senders is PENDLE staked and pushed on (on 2026-02-13, treasury PENDLE), not a points airdrop. Exit fees are counted on arrival below.
  tokenToDistributor.removeTokenBalance(SPENDLE)

  const dailyRevenue = options.createBalances()
  dailyRevenue.addBalances(treasuryInflows, 'YT And Swap Fees')
  dailyRevenue.addBalances(tokenToDistributor, 'Other Fees')
  dailyFees.addBalances(dailyRevenue, 'YT And Swap Fees');
  dailyFees.addBalances(dailySupplySideRevenue, 'AMM Swap Fees To LPs');

  // https://docs.pendle.finance/ProtocolMechanics/Mechanisms/Fees
  // Protocol revenue (20% cut) only started in September 2025; before that, 100% went to sPENDLE holders
  const protocolRevenueStartDate = new Date('2025-09-01').getTime() / 1000
  const hasProtocolRevenue = options.startOfDay >= protocolRevenueStartDate
  const dailyHoldersRevenue = hasProtocolRevenue ? dailyRevenue.clone(0.8, 'sPENDLE Distributions') : dailyRevenue.clone(1, 'sPENDLE Distributions')
  const dailyProtocolRevenue = hasProtocolRevenue ? dailyRevenue.clone(0.2, 'Treasury And Operations') : dailyRevenue.clone(0)

  // Two flows reach the treasury in tokens the SY and reward lists above never hold. They are added after the split on purpose:
  // Pendle's 80/10/10 covers yield and swap fees only and nothing public says where these go, so neither is booked to
  // dailyProtocolRevenue or dailyHoldersRevenue.
  const addTreasuryFees = (balances: any, label: string) => {
    dailyFees.addBalances(balances, label)
    dailyRevenue.addBalances(balances, label)
  }

  // instantUnstake sends its fee to feeReceiver() in PENDLE. sPENDLE exists only on Ethereum.
  if (chain === CHAIN.ETHEREUM) {
    const exitFees = await addTokensReceived({ options, target: chainConfig[chain].treasury, fromAdddesses: [SPENDLE], tokens: [PENDLE] })
    addTreasuryFees(exitFees, EXIT_FEES_LABEL)
  }

  // Each position box pays TREASURY() in the position's token. Boxes are per user, so match on the transactions that moved a
  // position. SY and reward tokens in those transactions are swap fees already counted above. Gross: Pendle pays the executors'
  // gas out of this, and that cost isn't netted.
  const looperTxs = new Set<string>()
  for (const eventAbi of LOOPER_POSITION_EVENTS) {
    const logs = await getLogs({ target: PT_LOOPER, eventAbi, onlyArgs: false })
    logs.forEach((log: any) => looperTxs.add(String(log.transactionHash).toLowerCase()))
  }
  if (looperTxs.size) {
    const countedTokens = new Set(rewardTokens.concat(sys).filter(Boolean).map((token) => token.toLowerCase()))
    const treasuryTopic = chainConfig[chain].treasury.toLowerCase().replace('0x', '').padStart(64, '0')
    const receipts = await getTxReceiptsWithRetry(chain, [...looperTxs])
    const looperFees = options.createBalances()
    receipts.forEach((receipt: any) => {
      (receipt?.logs ?? []).forEach((log: any) => {
        const [topic0, , to] = log.topics
        const token = log.address.toLowerCase()
        if (topic0 === ERC20_TRANSFER_TOPIC && log.topics.length === 3 && to?.toLowerCase().endsWith(treasuryTopic) && !countedTokens.has(token))
          looperFees.add(token, BigInt(log.data))
      })
    })
    addTreasuryFees(looperFees, LOOPER_FEES_LABEL)
  }

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
    Fees: 'Total yield from deposited assets + trading fees paid by yield traders + sPENDLE instant-exit fees + what PT Looper users pay the treasury.',
    Revenue: 'Sum of 5% fee from all yield + points accrued and 80% trading fees + sPENDLE instant-exit fees + what PT Looper users pay the treasury.',
    ProtocolRevenue: '20% of yield and swap fee revenue to protocol treasury and operations (since September 2025, 0% before). Excludes sPENDLE instant-exit fees and PT Looper receipts, whose destination is not published.',
    HoldersRevenue: '80% of yield and swap fee revenue distributed to sPENDLE holders (100% before September 2025). Excludes sPENDLE instant-exit fees and PT Looper receipts, whose destination is not published.',
    SupplySideRevenue: '20% of AMM swap fees distributed to liquidity providers.',
}

const breakdownMethodology = {
    Fees: {
      'YT And Swap Fees': 'YT fees (5% of all yield accrued by YT) + 80% of AMM swap fees + limit order swap fees sent to treasury.',
      'AMM Swap Fees To LPs': '20% of AMM swap fees retained by liquidity providers.',
      [EXIT_FEES_LABEL]: '5% of the sPENDLE unstaked through instantUnstake, paid in PENDLE to the Ethereum treasury.',
      [LOOPER_FEES_LABEL]: 'What PT Looper users pay the treasury, gross. Opening or increasing a loop: a dynamic service fee capped at 10 bps, with gas bundled in. Withdrawing or decreasing: gas only.',
    },
    Revenue: {
      'YT And Swap Fees': 'YT fees, AMM swap fees, and limit order fees collected by the treasury.',
      'Other Fees': 'Non-USDT fees from negotiated points, distributed via airdrop distributor. sPENDLE sent to the distributor is not counted.',
      [EXIT_FEES_LABEL]: 'sPENDLE instant-exit fees received by the Ethereum treasury.',
      [LOOPER_FEES_LABEL]: 'PT Looper service fees and gas charges received by the treasury, before the gas Pendle pays its executors.',
    },
    SupplySideRevenue: {
      'AMM Swap Fees To LPs': '20% of AMM swap fees distributed to liquidity providers.',
    },
    HoldersRevenue: {
      'sPENDLE Distributions': 'Revenue distributed to vePENDLE/sPENDLE holders as yield and reward tokens.',
    },
    ProtocolRevenue: {
      'Treasury And Operations': '20% of revenue split between protocol treasury (10%) and operations (10%), effective since September 2025.',
    },
}

const adapter: SimpleAdapter = {
  version: 2,
  // pullHourly: true,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2022-11-23' },
    [CHAIN.ARBITRUM]: { start: '2023-03-07' },
    [CHAIN.BSC]: { start: '2023-06-28' },
    [CHAIN.OPTIMISM]: { start: '2023-08-11' },
    [CHAIN.MANTLE]: { start: '2024-04-01' },
    [CHAIN.BASE]: { start: '2024-11-12' },
    [CHAIN.SONIC]: { start: '2025-02-14' },
    [CHAIN.BERACHAIN]: { start: '2025-02-07' }, 
    [CHAIN.PLASMA]: { start: '2025-09-24' },
    [CHAIN.HYPERLIQUID]: { start: '2025-07-09' },
    [CHAIN.MONAD]: { start: '2026-06-19' },
    [CHAIN.XLAYER]: { start: '2026-08-02' },
    [CHAIN.ROBINHOOD]: { start: '2026-09-02' },
  },
  methodology,
  breakdownMethodology,
};

async function getWhitelistedAssets(api: ChainApi): Promise<{
  markets: string[];
  sys: string[];
  marketToSy: Map<string, string>;
}> {
  // Should only cache api by week
  const weekId = Math.floor(Date.now() / 1000 / 60 / 60 / 24 / 7);

  let results: any[] = [];
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    let { results: newResults } = await getConfig(
      `pendle/v2/revenue-${api.chainId!}-${skip}-${weekId}`,
      `https://api-v2.pendle.finance/core/v1/${api.chainId!}/markets?order_by=name%3A1&skip=${skip}&limit=100&select=all`
    );
    newResults = newResults || []
    results = results.concat(newResults);
    skip += 100;
    hasMore = newResults.length === 100;
  }

  const markets = results.map((d: any) => d.lp.address);
  const sySet: Set<string> = new Set(results.map((d: any) => d.sy.address));
  const sys = Array.from(sySet);

  const marketToSy = new Map<string, string>();
  for (const result of results) {
    marketToSy.set(result.lp.address, result.sy.address);
  }

  return { markets, sys, marketToSy };
}

export default adapter;
