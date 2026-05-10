import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const COLLATERALIZED_EVENT =
  "event Collateralized(address indexed sender, uint256 collateralLock, uint256 positionTokensMinted, uint256 fees)";
const REDEEMED_EVENT =
  "event Redeemed(address indexed sender, uint256 collateralReleased, uint256 volatilityIndexTokenBurned, uint256 inverseVolatilityIndexTokenBurned, uint256 fees)";
const INDEX_REGISTERED_EVENT =
  "event IndexRegistered(uint256 indexed indexCount, address indexed protocol)";

const MINT_VOLUME = "Mint Volume";
const REDEEM_VOLUME = "Redeem Volume";
const MINT_REDEEM_FEES = "Mint/Redeem Fees";
const MINT_REDEEM_FEES_TO_TREASURY = "Mint/Redeem Fees To Treasury";

type FactoryConfig = { factory: string; fromBlock: number };

const FACTORIES: Record<string, FactoryConfig> = {
  [CHAIN.ETHEREUM]: { factory: "0x3ceea6a3c98c2489b09b820f62fe568b5e21e797", fromBlock: 12607954 },
  [CHAIN.POLYGON]:  { factory: "0x0a5f89cdc9e008af95788b057f6d8741374ae697", fromBlock: 16848791 },
  [CHAIN.ARBITRUM]: { factory: "0xee29f8e26285ebab06f20eb0e3e04161650dbefe", fromBlock: 2180226 },
};

const toBigInt = (value: bigint | number | string) => BigInt(value);

const fetch = async (options: FetchOptions) => {
  const { factory, fromBlock } = FACTORIES[options.chain];

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  const indexRegisteredLogs = await options.getLogs({
    target: factory,
    eventAbi: INDEX_REGISTERED_EVENT,
    fromBlock,
    onlyArgs: true,
    cacheInCloud: true,
  });
  const targets: string[] = indexRegisteredLogs.map((log: any) => log.protocol);

  const collaterals: string[] = await options.api.multiCall({
    abi: "address:collateral",
    calls: targets,
  });

  const [collateralizedLogs, redeemedLogs] = await Promise.all([
    options.getLogs({ targets, eventAbi: COLLATERALIZED_EVENT, flatten: false }),
    options.getLogs({ targets, eventAbi: REDEEMED_EVENT, flatten: false }),
  ]);

  targets.forEach((_, index) => {
    const collateral = collaterals[index];
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
      start: "2021-06-10",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2021-07-14",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2021-10-13",
    },
  },
  methodology,
  breakdownMethodology,
};

export default adapter;
