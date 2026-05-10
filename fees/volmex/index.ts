import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import ADDRESSES from "../../helpers/coreAssets.json";

const COLLATERALIZED_EVENT =
  "event Collateralized(address indexed sender, uint256 collateralLock, uint256 positionTokensMinted, uint256 fees)";
const REDEEMED_EVENT =
  "event Redeemed(address indexed sender, uint256 collateralReleased, uint256 volatilityIndexTokenBurned, uint256 inverseVolatilityIndexTokenBurned, uint256 fees)";

type MarketConfig = {
  target: string;
  collateral: string;
};

const MINT_VOLUME = "Mint Volume";
const REDEEM_VOLUME = "Redeem Volume";
const MINT_REDEEM_FEES = "Mint/Redeem Fees";
const MINT_REDEEM_FEES_TO_TREASURY = "Mint/Redeem Fees To Treasury";

const V1_MARKETS: Record<string, MarketConfig[]> = {
  [CHAIN.ETHEREUM]: [
    { target: "0xa57fC404f69fCE71CA26e26f0A4DF7F35C8cd5C3", collateral: ADDRESSES.ethereum.DAI },
    { target: "0x187922d4235D10239b2c6CCb2217aDa724F56DDA", collateral: ADDRESSES.ethereum.DAI },
    { target: "0x1BB632a08936e17Ee3971E6Eeb824910567e120B", collateral: ADDRESSES.ethereum.USDC },
    { target: "0x054FBeBD2Cb17205B57fb56a426ccc54cAaBFaBC", collateral: ADDRESSES.ethereum.USDC },
  ],
  [CHAIN.POLYGON]: [
    { target: "0x164c668204Ce54558431997A6DD636Ee4E758b19", collateral: ADDRESSES.polygon.DAI },
    { target: "0x90E6c403c02f72986a98E8a361Ec7B7C8BC29259", collateral: ADDRESSES.polygon.DAI },
    { target: "0xEeb6f0C2261E21b657A27582466e5aD9acC072D7", collateral: ADDRESSES.polygon.USDC },
    { target: "0xA2b3501d34edA289F0bEF1cAf95E5D0111032F36", collateral: ADDRESSES.polygon.USDC },
  ],
  [CHAIN.ARBITRUM]: [
    { target: "0xE46277336d9CC2eBe7b24bA7268624F5f1495611", collateral: ADDRESSES.arbitrum.DAI },
    { target: "0xf613b55131cf8a69c5b4f62d0d5e5d2c2d9c3280", collateral: ADDRESSES.arbitrum.DAI },
    { target: "0xF9b04Aad2612D3d664F41E9aF5711953E058ff52", collateral: ADDRESSES.arbitrum.USDC },
    { target: "0xdf87072ac4722431861837492edf7adbfec0efa9", collateral: ADDRESSES.arbitrum.USDC },
  ],
};

const toBigInt = (value: bigint | number | string) => BigInt(value);

const fetch = async (options: FetchOptions) => {
  const markets = V1_MARKETS[options.chain];
  const targets = markets.map(({ target }) => target);

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  let collateralizedLogs: any[];
  let redeemedLogs: any[];
  try {
    [collateralizedLogs, redeemedLogs] = await Promise.all([
      options.getLogs({ targets, eventAbi: COLLATERALIZED_EVENT, flatten: false }),
      options.getLogs({ targets, eventAbi: REDEEMED_EVENT, flatten: false }),
    ]);
  } catch (error) {
    console.error(`[volmex-v1][${options.chain}] failed to fetch logs for ${targets.join(",")}`, error);
    return {
      dailyVolume,
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue,
    };
  }

  markets.forEach(({ collateral }, index) => {
    for (const log of collateralizedLogs[index] ?? []) {
      const fees = toBigInt(log.fees);
      dailyVolume.add(collateral, toBigInt(log.collateralLock) + fees, MINT_VOLUME);
      dailyFees.add(collateral, fees, MINT_REDEEM_FEES);
      dailyRevenue.add(collateral, fees, MINT_REDEEM_FEES_TO_TREASURY);
      dailyProtocolRevenue.add(collateral, fees, MINT_REDEEM_FEES_TO_TREASURY);
    }

    for (const log of redeemedLogs[index] ?? []) {
      const fees = toBigInt(log.fees);
      dailyVolume.add(collateral, toBigInt(log.collateralReleased) + fees, REDEEM_VOLUME);
      dailyFees.add(collateral, fees, MINT_REDEEM_FEES);
      dailyRevenue.add(collateral, fees, MINT_REDEEM_FEES_TO_TREASURY);
      dailyProtocolRevenue.add(collateral, fees, MINT_REDEEM_FEES_TO_TREASURY);
    }
  });

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
  };
};

const methodology = {
  Fees: "Volmex V1 mint and redeem fees emitted by the protocol Collateralized and Redeemed events.",
  Revenue: "All tracked V1 mint and redeem fees accrue to the protocol treasury.",
  ProtocolRevenue: "All tracked V1 mint and redeem fees accrue to the protocol treasury.",
  SupplySideRevenue: "Volmex V1 mint and redeem protocol fees do not have a supply-side split.",
  Volume: "Gross V1 mint and redeem collateral notional, calculated as net collateral emitted by the event plus the fee amount.",
};

const breakdownMethodology = {
  Fees: {
    [MINT_REDEEM_FEES]: "Fees emitted by V1 Collateralized and Redeemed events.",
  },
  Revenue: {
    [MINT_REDEEM_FEES_TO_TREASURY]: "V1 mint and redeem fees collected by the protocol treasury.",
  },
  ProtocolRevenue: {
    [MINT_REDEEM_FEES_TO_TREASURY]: "V1 mint and redeem fees collected by the protocol treasury.",
  },
  Volume: {
    [MINT_VOLUME]: "Gross V1 collateral deposited for minting volatility token pairs.",
    [REDEEM_VOLUME]: "Gross V1 collateral redeemed by burning volatility token pairs.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2021-05-01",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2021-08-02",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2022-05-14",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
