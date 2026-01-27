import { FetchOptions, FetchResultOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const trade: Record<string, Record<string, any>> = {
  avalon: {
    [CHAIN.OPTIMISM]: [
      "0x1d42a98848e022908069c2c545aE44Cc78509Bc8", //eth
      "0x3D96418B63749DF7d6C31AD66ecBEe210B1456b4", //sol
      "0xc7f1A22c30aE981E6A74a0267CE6cBBF27D8ecD5", //btc
    ],
    abi: "event Trade(address indexed trader, uint256 indexed strikeId, uint256 indexed positionId, (uint256 expiry, uint256 strikePrice, uint8 optionType, uint8 tradeDirection, uint256 amount, uint256 setCollateralTo, bool isForceClose, uint256 spotPrice, uint256 reservedFee, uint256 totalCost) trade, (uint256, uint256, uint256, uint256, (int256, int256, uint256, uint256, uint256, uint256), (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256), uint256, uint256, uint256, uint256, uint256)[] tradeResults, (address, address, uint256, uint256, uint256, uint256, uint256, uint256) liquidation, uint256 timestamp)",
  },

  newPort: {
    [CHAIN.OPTIMISM]: [
      "0xDD827aebF9d972C09f6594d82d50676B7cAfDa7E", //btc
      "0x59c671B1a1F261FB2192974B43ce1608aeFd328E", //eth
      "0x2A21bfCA834D122769Cdf9D50B609CA6b210b7F0", //op
      "0xf10bB5296Aa5bdA5C190CE22f8acb4d4adAae1Cd", //arb
    ],
    [CHAIN.ARBITRUM]: [
      "0xe044919cf58dfb066fc9de7c69c7db19f336b20c", //btc
      "0x919E5e0C096002cb8a21397D724C4e3EbE77bC15", //eth
    ],
    abi: "event Trade(address indexed trader, uint256 indexed positionId, address indexed referrer, (uint256 strikeId, uint256 expiry, uint256 strikePrice, uint8 optionType, uint8 tradeDirection, uint256 amount, uint256 setCollateralTo, bool isForceClose, uint256 spotPrice, uint256 reservedFee, uint256 totalCost) trade, (uint256, uint256, uint256, uint256, (int256, int256, uint256, uint256, uint256, uint256), (uint256, uint256, uint256, uint256, uint256, uint256, uint256, uint256), uint256, uint256, uint256, uint256, uint256)[] tradeResults, (address, address, uint256, uint256, uint256, uint256, uint256, uint256) liquidation, uint256 longScaleFactor, uint256 timestamp)",
  },

  lyra: {
    [CHAIN.ARBITRUM]: [
      "0x7964355735DC8F6583bfBddDE1914F09C654636e" //btc
    ],
    abi: "event Trade(address indexed trader, uint256 indexed positionId, address indexed referrer, tuple(uint256 strikeId, uint256 expiry, uint256 strikePrice, uint8 optionType, uint8 tradeDirection, uint256 amount, uint256 setCollateralTo, bool isForceClose, uint256 spotPrice, uint256 reservedFee, uint256 totalCost) trade, tuple(uint256 amount, uint256 premium, uint256 optionPriceFee, uint256 spotPriceFee, tuple(int256 preTradeAmmNetStdVega, int256 postTradeAmmNetStdVega, uint256 vegaUtil, uint256 volTraded, uint256 NAV, uint256 vegaUtilFee) vegaUtilFee, tuple(uint256 varianceFeeCoefficient, uint256 vega, uint256 vegaCoefficient, uint256 skew, uint256 skewCoefficient, uint256 ivVariance, uint256 ivVarianceCoefficient, uint256 varianceFee) varianceFee, uint256 totalFee, uint256 totalCost, uint256 volTraded, uint256 newBaseIv, uint256 newSkew)[] tradeResults, tuple(address rewardBeneficiary, address caller, uint256 returnCollateral, uint256 lpPremiums, uint256 lpFee, uint256 liquidatorFee, uint256 smFee, uint256 insolventAmount) liquidation, uint256 longScaleFactor, uint256 timestamp)",
  }
}

const openClose = {
  v1: {
    targets: [
      { "0xA3562CAc1c39f4D4166CE31005Fc080AB41120aC": "solana" },
      { "0x47B5BB79F06F06db3D77C6cc4DB1ad6E84faF1f4": "bitcoin" },
      { "0x1f6D98638Eee9f689684767C3021230Dd68df419": "ethereum" },
      { "0xbcb01210bd1c0790ca45cc4c49d9a183be99824d": "chainlink" }
    ],
    positionOpened: {
      abi: "event PositionOpened(address indexed trader, uint256 indexed listingId, uint8 indexed tradeType, uint256 amount, uint256 totalCost)",
    },
    positionClosed: {
      abi: "event PositionClosed(address indexed trader, uint256 indexed listingId, uint8 indexed tradeType, uint256 amount, uint256 totalCost)",
    },
  },
}

async function fetch(options: FetchOptions): Promise<FetchResultOptions> {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  const chain: string = options.chain;

  for (const version of Object.values(trade)) {
    const targets = version[chain];
    if (targets) {
      const tradeLogs = await options.getLogs({
        targets,
        eventAbi: version.abi
      })
      tradeLogs.forEach(log => {
        const totalCostPosition = log.trade.length === 10 ? 9 : 10;
        const amountPosition = log.trade.length === 10 ? 4 : 5;
        const spotPricePosition = log.trade.length === 10 ? 7 : 8
        dailyNotionalVolume.addUSDValue((Number(log.trade[amountPosition]) / 1e18) * (Number(log.trade[spotPricePosition]) / 1e18));
        dailyPremiumVolume.addUSDValue(Number(log.trade[totalCostPosition]) / 1e18)
      })
    }
  }

  if (options.chain === CHAIN.OPTIMISM) {
    const optionMarkets = openClose.v1.targets.map(target => Object.keys(target)[0])

    const positionOpenedLogs = await options.getLogs({
      targets: optionMarkets,
      eventAbi: openClose.v1.positionOpened.abi,
      flatten: false
    });

    const positionClosedLogs = await options.getLogs({
      targets: optionMarkets,
      eventAbi: openClose.v1.positionClosed.abi,
      flatten: false
    })

    for (let i = 0; i < positionOpenedLogs.length; i++) {
      const cgToken: string = Object.values(openClose.v1.targets[i])[0];

      positionOpenedLogs[i].forEach((log: any) => {
        dailyPremiumVolume.addUSDValue(Number(log.totalCost) / 1e18);
        dailyNotionalVolume.addCGToken(cgToken, Number(log.amount) / 1e18);
      });

      positionClosedLogs[i].forEach((log: any) => {
        dailyPremiumVolume.addUSDValue(Number(log.totalCost) / 1e18);
        dailyNotionalVolume.addCGToken(cgToken, Number(log.amount) / 1e18);
      });
    }

  }

  return {
    dailyNotionalVolume,
    dailyPremiumVolume,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.OPTIMISM]: {
      start: '2021-11-12',
      deadFrom: '2025-03-06'
    },
    [CHAIN.ARBITRUM]: {
      start: '2023-01-12',
      deadFrom: '2023-12-29'
    }
  },
}

export default adapter;