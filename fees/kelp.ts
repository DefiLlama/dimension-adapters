import ADDRESSES from "../helpers/coreAssets.json";
import { CHAIN } from "../helpers/chains";
import { Adapter, FetchOptions, FetchResultV2 } from "../adapters/types";
import * as sdk from "@defillama/sdk";
import { getPrices } from "../utils/prices";

// Kelp earns rewards from ETH and reward tokens (e.g. EIGEN) via EigenLayer restaking.
// Methodology below describes how fees and revenues are categorized.
const methodology = {
  Fees: "Sum of total staking rewards from agETH, hgETH.",
  SupplySideRevenue: "All staking rewards are distributed to stakers (rsETH holders).",
  Revenue: "Sum of rsETH transfers to agETH feesCollector (2% management fee, charged manually), sum of rsETH transfers to hgETH feesCollector (1.5% management fee), performance fee: 20% of positive hgETH rate delta",
  ProtocolRevenue: "Sum of rsETH transfers to agETH feesCollector (2% management fee, charged manually), sum of rsETH transfers to hgETH feesCollector (1.5% management fee), performance fee: 20% of positive hgETH rate delta",
};

const LRTOracle = "0x349A73444b1a310BAe67ef67973022020d70020d";
const LRTConfig = "0x947Cb49334e6571ccBFEF1f1f1178d8469D65ec7";
const EigenRewardDistributor = "0x9bb6d4b928645eda8f9c019495695ba98969eff1";
const EigenToken = ADDRESSES.ethereum.EIGEN;

const rsETHMaps: any = {
  [CHAIN.ETHEREUM]: "0xA1290d69c65A6Fe4DF752f95823fae25cB99e5A7",
  [CHAIN.ARBITRUM]: ADDRESSES.berachain.rsETH,
  [CHAIN.BLAST]: ADDRESSES.berachain.rsETH,
  [CHAIN.SCROLL]: "0x65421ba909200b81640d98b979d07487c9781b66",
  [CHAIN.OPTIMISM]: ADDRESSES.berachain.rsETH,
  [CHAIN.BASE]: "0x1Bc71130A0e39942a7658878169764Bbd8A45993",
  [CHAIN.LINEA]: ADDRESSES.berachain.rsETH,
  [CHAIN.ERA]: "0x6be2425c381eb034045b527780d2bf4e21ab7236",
};

const Abis = {
  protocolFeeInBPS: "uint256:protocolFeeInBPS",
  rsETHPrice: "uint256:rsETHPrice",
  totalSupply: "uint256:totalSupply",
  feeInBPS: "uint256:feeInBPS",
  ClaimedEvent: "event Claimed(uint256 index, address account, uint256 amount)",
  Transfer:
    "event Transfer(address indexed from, address indexed to, uint256 value)",
  // new methods for hgETH
  managementFeePercent: "uint256:managementFeePercent",
  convertToAssets:
    "function convertToAssets(uint256 shares) view returns (uint256)",
};

// agETH (ETH mainnet only)
const AGETH_FEE_SENDER = "0x931250786dFd106B1E63C7Fd8f0d854876a45200";
const AGETH_FEES_COLLECTOR = "0xd5F05CB49012090AB5dFbb57152c2fB7668cfcC9";

// hgETH (ETH mainnet only)
const HGETH = "0xc824A08dB624942c5E5F330d56530cD1598859fD"; // for hgETH, the contract itself is the fee sender
const HGETH_FEES_COLLECTOR = "0x2151A97C7819782fD99efF020CdfE0aE838Ad378";
const HGETH_PERF_FEE_BPS = 2000; // 20%
const HGETH_PERF_TVL_USD_THRESHOLD = 50_000_000;

// Inclusive: 2025-01-25 00:00:00 UTC  →  2025-05-19 23:59:59 UTC (no fees of any kid were collected for hgETH vault during this period)
const HGETH_FEE_HOLIDAY_START = Math.floor(Date.UTC(2025, 0, 25, 0, 0, 0) / 1000)   // Jan is 0
const HGETH_FEE_HOLIDAY_END_EXCL = Math.floor(Date.UTC(2025, 4, 20, 0, 0, 0) / 1000) // May is 4 (exclusive end = May 20 00:00:00)

function hgETHFeeHolidayOverlaps(fromTs: number, toTs: number) {
  // true if the 24h window intersects the holiday range
  return fromTs < HGETH_FEE_HOLIDAY_END_EXCL && toTs > HGETH_FEE_HOLIDAY_START;
}

async function fetch(options: FetchOptions): Promise<FetchResultV2> {
  const dailyFees = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // get corresponding block on ethereum chain
  const beforeBlock = await sdk.util.blocks.getBlock(
    CHAIN.ETHEREUM,
    options.fromTimestamp
  );
  const afterBlock = await sdk.util.blocks.getBlock(
    CHAIN.ETHEREUM,
    options.toTimestamp
  );

  // get rsETH prices on Ethereum
  const rsETHPriceBefore = await sdk.api2.abi.call({
    chain: CHAIN.ETHEREUM,
    target: LRTOracle,
    abi: Abis.rsETHPrice,
    block: beforeBlock.number,
  });
  const rsETHPriceAfter = await sdk.api2.abi.call({
    chain: CHAIN.ETHEREUM,
    target: LRTOracle,
    abi: Abis.rsETHPrice,
    block: afterBlock.number,
  });

  // get protocol fee rate config
  let protocolFeeRate = 0;
  try {
    const protocolFeeInBPS = await sdk.api2.abi.call({
      chain: CHAIN.ETHEREUM,
      target: LRTConfig,
      abi: Abis.protocolFeeInBPS,
      block: beforeBlock.number,
    });
    protocolFeeRate = Number(protocolFeeInBPS) / 1e4;
  } catch (e: any) {}

  const totalSupply = await options.api.call({
    target: rsETHMaps[options.chain],
    abi: Abis.totalSupply,
  });

  const priceGrowth = Number(rsETHPriceAfter) - Number(rsETHPriceBefore);
  const totalFees =
    (Number(totalSupply) * priceGrowth) / (1 - protocolFeeRate) / 1e18;
  const protocolRevenue = totalFees * protocolFeeRate;
  const supplySideRevenue = totalFees - protocolRevenue;

  dailyFees.addGasToken(totalFees);
  dailyProtocolRevenue.addGasToken(protocolRevenue);
  dailySupplySideRevenue.addGasToken(supplySideRevenue);

  if (options.chain === CHAIN.ETHEREUM) {
    const claimedEvents: Array<any> = await options.getLogs({
      target: EigenRewardDistributor,
      eventAbi: Abis.ClaimedEvent,
    });
    if (claimedEvents.length > 0) {
      const feeInBPS = await options.api.call({
        target: EigenRewardDistributor,
        abi: Abis.feeInBPS,
      });
      const feeRate = Number(feeInBPS) / 1e4;
      for (const event of claimedEvents) {
        const amount = Number(event.amount);
        dailyFees.add(EigenToken, amount);
        dailyProtocolRevenue.add(EigenToken, amount * feeRate);
        dailySupplySideRevenue.add(EigenToken, amount * (1 - feeRate));
      }
    }
  }

  // get rsETH transfer events (for agETH and hgETH fees)
  let rsEthLogs: any[] = [];
  if (options.chain === CHAIN.ETHEREUM) {
    rsEthLogs = await options.getLogs({
      target: rsETHMaps[CHAIN.ETHEREUM],
      eventAbi: Abis.Transfer,
    });
  }

  // get agETH management fees: rsETH transfers to agETH fee collector
  if (options.chain === CHAIN.ETHEREUM) {
    const targetTo = AGETH_FEES_COLLECTOR.toLowerCase();
    const fromAllow = new Set([AGETH_FEE_SENDER.toLowerCase()]);
    let agEthFees = 0;
    for (const ev of rsEthLogs) {
      if (
        ev?.to?.toLowerCase() === targetTo &&
        fromAllow.has(ev?.from?.toLowerCase())
      ) {
        agEthFees += Number(ev.value); // rsETH wei
      }
    }
    if (agEthFees > 0) {
      dailyFees.add(rsETHMaps[CHAIN.ETHEREUM], agEthFees.toString());
      dailyProtocolRevenue.add(rsETHMaps[CHAIN.ETHEREUM], agEthFees.toString());
    }
  }

  if (options.chain === CHAIN.ETHEREUM) {
      const suppressHgETHFees = hgETHFeeHolidayOverlaps(
        options.fromTimestamp,
        options.toTimestamp
      );

      if (!suppressHgETHFees) {
        // get hgETH management fees: rsETH transfers to hgETH fee collector
        const targetTo = HGETH_FEES_COLLECTOR.toLowerCase();
        const fromAllow = new Set([HGETH.toLowerCase()]);
        let hgEthFees = 0;
        for (const ev of rsEthLogs) {
          if (
            ev?.to?.toLowerCase() === targetTo &&
            fromAllow.has(ev?.from?.toLowerCase())
          ) {
            hgEthFees += Number(ev.value); // rsETH wei
          }
        }
        if (hgEthFees > 0) {
          dailyFees.add(rsETHMaps[CHAIN.ETHEREUM], hgEthFees.toString());
          dailyProtocolRevenue.add(
            rsETHMaps[CHAIN.ETHEREUM],
            hgEthFees.toString()
          );
        }

        // get hgETH performance fees
        if (options.chain === CHAIN.ETHEREUM) {
          // reuse beforeBlock/afterBlock computed earlier
          const [rateBefore, rateAfter] = await Promise.all([
            sdk.api2.abi.call({
              chain: CHAIN.ETHEREUM,
              target: HGETH,
              abi: Abis.convertToAssets,
              params: ["1000000000000000000"], // 1e18
              block: beforeBlock.number,
            }),
            sdk.api2.abi.call({
              chain: CHAIN.ETHEREUM,
              target: HGETH,
              abi: Abis.convertToAssets,
              params: ["1000000000000000000"], // 1e18
              block: afterBlock.number,
            }),
          ]);

          const hgSupply = await options.api.call({
            target: HGETH,
            abi: Abis.totalSupply,
          }); // 18 decimal shares
          const delta = Number(rateAfter) - Number(rateBefore); // rsETH/share (wei)
          if (delta > 0) {
            const gainsRsETHWei = (Number(hgSupply) * delta) / 1e18; // rsETH wei
            const tvlRsETHWei = (Number(hgSupply) * Number(rateAfter)) / 1e18;

            // price rsETH in USD
            const prices = await getPrices(
              [`ethereum:${rsETHMaps[CHAIN.ETHEREUM]}`],
              options.toTimestamp
            );
            const rsEthUsd =
              prices[`ethereum:${rsETHMaps[CHAIN.ETHEREUM]}`]?.price || 0;
            const tvlUsd = (tvlRsETHWei / 1e18) * rsEthUsd;

            if (tvlUsd > HGETH_PERF_TVL_USD_THRESHOLD) {
              const perfFeeWei = gainsRsETHWei * (HGETH_PERF_FEE_BPS / 10_000); // 20% performance fee
              dailyFees.add(rsETHMaps[CHAIN.ETHEREUM], perfFeeWei.toString());
              dailyProtocolRevenue.add(
                rsETHMaps[CHAIN.ETHEREUM],
                perfFeeWei.toString()
              );
            }
          }
        }
      }
  }

  return {
    dailyFees,
    dailySupplySideRevenue,
    dailyRevenue: dailyProtocolRevenue,
    dailyProtocolRevenue,
  };
}

const adapter: Adapter = {
  version: 2,
  methodology,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: "2023-12-11" },
    [CHAIN.ARBITRUM]: { start: "2024-02-07" },
    [CHAIN.BLAST]: { start: "2024-03-20" },
    [CHAIN.SCROLL]: { start: "2024-03-26" },
    [CHAIN.OPTIMISM]: { start: "2024-04-06" },
    [CHAIN.BASE]: { start: "2024-04-06" },
    [CHAIN.LINEA]: { start: "2024-04-16" },
    [CHAIN.ERA]: { start: "2024-05-16" },
  },
};

export default adapter;
