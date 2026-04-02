import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import coreAssets from "../../helpers/coreAssets.json";
import { METRIC } from "../../helpers/metrics";

const FACTORY = "0x86afAc9161063dE33FE1Af6796a129b6Ed861fEb";

const TokenDeployed = "event TokenDeployed(address indexed tokenAddr, uint256 indexed tokenId, address indexed creator)";
const ReserveUpdated = "event ReserveUpdated(bool isBuy, uint256 amountIn, uint256 amountOut, uint256 baseTokenReserves, uint256 tokenReserves)";

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const asset = coreAssets.bsc.WBNB;

  const deployLogs = await options.getLogs({ target: FACTORY, eventAbi: TokenDeployed, fromBlock: 46527985, cacheInCloud: true });
  const targets = deployLogs.map((d: any) => d.tokenAddr);

  const logs = await options.getLogs({ targets, eventAbi: ReserveUpdated, flatten: true });

  for (const log of logs) {
    if (log.isBuy) {
        const fee = log.amountIn / 100n;
        const protocolsCut = fee * 7n / 10n
        dailyVolume.add(asset, log.amountIn);
        dailyFees.add(asset, fee, METRIC.TRADING_FEES);
        dailyRevenue.add(asset, protocolsCut, METRIC.TRADING_FEES);
        dailySupplySideRevenue.add(asset, fee - protocolsCut, METRIC.CREATOR_FEES);
    } else {
        // amountOut is net (after 1% fee)
        const gross = log.amountOut * 100n / 99n;
        const fee = gross - log.amountOut;
        const protocolsCut = fee * 7n / 10n
        dailyVolume.add(asset, gross);
        dailyFees.add(asset, fee, METRIC.TRADING_FEES);
        dailyRevenue.add(asset, protocolsCut, METRIC.TRADING_FEES);
        dailySupplySideRevenue.add(asset, fee - protocolsCut, METRIC.CREATOR_FEES);
    }
  }

  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const adapter: SimpleAdapter = {
    version: 2,
    pullHourly: true,
    fetch,
    chains: [CHAIN.BSC],
    start: "2025-02-11",
    methodology: {
        Volume: "Total BNB traded through bonding curve buy and sell transactions.",
        Fees: "A 1% fee is charged on every buy and sell.",
        Revenue: "70% of fees go to the protocol fee collector.",
        ProtocolRevenue: "70% of fees go to the protocol fee collector.",
        SupplySideRevenue: "30% of fees go to the token creator.",
    },
    breakdownMethodology: {
        Fees: {
            [METRIC.TRADING_FEES]: "1% fee on every bonding curve trade.",
        },
        Revenue: {
            [METRIC.TRADING_FEES]: "70% of the 1% trading fee sent to the protocol fee collector.",
        },
        SupplySideRevenue: {
            [METRIC.CREATOR_FEES]: "30% of the 1% trading fee sent to the token creator.",
        }
    }
};

export default adapter;
