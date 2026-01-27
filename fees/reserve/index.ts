import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import fetchURL from "../../utils/fetchURL";

const indexDtfDeployerAddresses: any = {
  [CHAIN.ETHEREUM]: [
    "0xaafb13a3df7cE70c140E40c959D58Fd5Cc443Cba",
    "0x4C64ef51cB057867e40114DcFA3702c2955d3644",
    "0xBE3B47587cEeff7D48008A0114f51cD571beC63A",
  ],
  [CHAIN.BASE]: [
    "0xE926577a152fFD5f5036f88BF7E8E8D3652B558C",
    "0xb8469986840bc9b7Bb101C274950c02842755911",
    "0xA203AA351723cf943f91684e9F5eFcA7175Ae7EA",
  ],
  [CHAIN.BSC]: [
    "0x100E0eFDd7a4f67825E1BE5f0493F8D2AEAc00bb",
    "0x5Bed18AcA50E6057E6658Fe8498004092EedCDcF",
  ],
};

const yieldDtfDeployerAddresses: any = {
  [CHAIN.ETHEREUM]: [
    "0x9cAc8ED3297040626D8aA6317F5e29813A6A8fc6",
    "0xC19f5d60e2Aca1174f3D5Fe189f0A69afaB76f50",
    "0xFd6CC4F251eaE6d02f9F7B41D1e80464D3d2F377",
    "0x5c46b718Cd79F2BBA6869A3BeC13401b9a4B69bB",
    "0x1BD20253c49515D348dad1Af70ff2c0473FEa358",
    "0x15480f5B5ED98A94e1d36b52Dd20e9a35453A38e",
    "0x43587CAA7dE69C3c2aD0fb73D4C9da67A8E35b0b",
    "0x2204EC97D31E2C9eE62eaD9e6E2d5F7712D3f1bF"
  ],
  [CHAIN.BASE]: [
    "0xf1B06c2305445E34CF0147466352249724c2EAC1",
    "0x9C75314AFD011F22648ca9C655b61674e27bA4AC",
    "0xFD18bA9B2f9241Ce40CDE14079c1cDA1502A8D0A"
  ],
  [CHAIN.BSC]: []
}

const chainConfig: Record<string, { start: string, chainId: number, indexDtfStartBlock: number, yieldDtfStartBlock?: number }> = {
  [CHAIN.ETHEREUM]: {
    start: '2023-04-18',
    chainId: 1,
    indexDtfStartBlock: 21845736,
    yieldDtfStartBlock: 16681681,
  },
  [CHAIN.BASE]: {
    start: '2023-10-12',
    chainId: 8453,
    indexDtfStartBlock: 25958005,
    yieldDtfStartBlock: 10871647,
  },
  [CHAIN.BSC]: {
    start: '2025-07-11',
    chainId: 56,
    indexDtfStartBlock: 53679824,
  },
}

const ABI = {
  folioDeployed: "event FolioDeployed(address indexed folioOwner, address indexed folio, address folioAdmin)",
  protocolFee: "event ProtocolFeePaid (address indexed recipient, uint256 amount)",
  folioFee: "event FolioFeePaid (address indexed recipient, uint256 amount)",
  melted: "event Melted (uint256 amount)",
  rTokenCreated: "event RTokenCreated (address indexed main,address indexed rToken, address stRSR, address indexed owner, string version)",
  exchangeRate: "function exchangeRate() view returns (uint192)",
}

const RESERVE_ENDPOINT = "https://api.reserve.org/current/dtf?";

const fetch = async (options: FetchOptions) => {
  const chainId = chainConfig[options.chain].chainId
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const indexAddresses = indexDtfDeployerAddresses[options.chain];
  const folioDeployedLogs: any[] = indexAddresses.length
    ? await options.getLogs({
      targets: indexAddresses,
      eventAbi: ABI.folioDeployed,
      fromBlock: chainConfig[options.chain].indexDtfStartBlock
    })
    : [];

  const yieldAddresses = yieldDtfDeployerAddresses[options.chain];
  const rTokenCreatedLogs = yieldAddresses.length
    ? await options.getLogs({
        targets: yieldAddresses,
        eventAbi: ABI.rTokenCreated,
        fromBlock: chainConfig[options.chain].yieldDtfStartBlock,
      })
    : [];

  const indexFoliosList: any[] = folioDeployedLogs.flatMap(deploy => deploy.folio);
  const yieldFoliosList: any[] = [];
  const stRsrList: any[] = [];

  rTokenCreatedLogs.forEach((rToken: any) => {
    yieldFoliosList.push(rToken.rToken);
    stRsrList.push(rToken.stRSR);
  });
  const allProtocolFeeLogs = await options.getLogs({
    targets: indexFoliosList,
    eventAbi: ABI.protocolFee,
    flatten: false,
  });
  const protocolFeeResults = allProtocolFeeLogs.map((logs: any, i: number) => ({
    folio: indexFoliosList[i],
    protocolFeeLogs: logs
  }));

  const allFolioFeeLogs = await options.getLogs({
    targets: indexFoliosList,
    eventAbi: ABI.folioFee,
    flatten: false,
  });
  const folioFeeResults = allFolioFeeLogs.map((logs: any, i: number) => ({
    folio: indexFoliosList[i],
    folioFeeLogs: logs
  }));

  const priceResult = await Promise.allSettled(indexFoliosList.map(async (folio: any) => fetchURL(`${RESERVE_ENDPOINT}address=${folio}&chainId=${chainId}`)
  ));

  const folioPriceMap = new Map();

  indexFoliosList.forEach((folio, i) => {
    let price = 0;
    if (priceResult[i].status === "fulfilled")
      price = (priceResult[i]?.value?.price) ?? 0;
    folioPriceMap.set(folio, price);
  });

  protocolFeeResults.forEach((result: any) => {
    const { folio, protocolFeeLogs } = result;
    protocolFeeLogs.forEach((protocolFee: any) => {
      dailyHoldersRevenue.addUSDValue(folioPriceMap.get(folio) * Number(protocolFee.amount) / 1e18, METRIC.TOKEN_BUY_BACK);
      dailyFees.addUSDValue(folioPriceMap.get(folio) * Number(protocolFee.amount) / 1e18, METRIC.TOKEN_BUY_BACK);
    });
  });

  folioFeeResults.forEach((result: any) => {
    const { folio, folioFeeLogs } = result;
    folioFeeLogs.forEach((folioFee: any) => {
      dailyFees.addUSDValue(folioPriceMap.get(folio) * Number(folioFee.amount) / 1e18, METRIC.MANAGEMENT_FEES);
    });
  });

  const yieldFolioMeltedLogs: any[] = yieldFoliosList.length ?  await options.getLogs({
    targets: yieldFoliosList,
    eventAbi: ABI.melted,
    flatten: false,
  }) : [];

  const yieldFolioMeltedResults = yieldFoliosList.map((folio: any, i: number) => ({
    folio,
    meltedLogs: yieldFolioMeltedLogs[i]
  }));

  yieldFolioMeltedResults.forEach((result: any) => {
    const { folio, meltedLogs } = result;
    meltedLogs.forEach((melt: any) => {
      dailySupplySideRevenue.add(folio, melt.amount, METRIC.ASSETS_YIELDS);
      dailyFees.add(folio, melt.amount, METRIC.ASSETS_YIELDS);
    });
  });

  const stRsrExchangeRateBefore = await options.fromApi.multiCall({
    calls: stRsrList,
    abi: ABI.exchangeRate,
    permitFailure: true
  });

  const stExchangeRateAfter = await options.toApi.multiCall({
    calls: stRsrList,
    abi: ABI.exchangeRate,
    permitFailure: true
  });

  const stRsrSupplyList = await options.api.multiCall({
    calls: stRsrList,
    abi: 'uint256:totalSupply',
    permitFailure: true
  });

  stRsrList.forEach((_, index: any) => {
    const revenue = (stExchangeRateAfter[index] - stRsrExchangeRateBefore[index]) * (stRsrSupplyList[index] / 1e36);
    dailyHoldersRevenue.addCGToken("reserve-rights-token", revenue, METRIC.STAKING_REWARDS);
    dailyFees.addCGToken("reserve-rights-token", revenue, METRIC.STAKING_REWARDS);
  });

  return {
    dailyFees,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue
  };
};

const methodology = {
  Fees: "Includes tvl fee, mint fee, platform fee, yields of yield DTF's, governance fee",
  Revenue: "Includes some percentage of yields going to RSR token stakers, 100% of platform fee going to RSR buy back and burn",
  HoldersRevenue: "Includes some percentage of yields going to RSR token stakers, 100% of platform fee going to RSR buy back and burn",
  SupplySideRevenue: "Includes yields earned by yield DTF holders which is usually realised by melting yield DTF"
};

const breakdownMethodology = {
  Fees: {
    [METRIC.MINT_REDEEM_FEES]: `Some percentange of mint fee applied while minting the DTF's`,
    [METRIC.ASSETS_YIELDS]: 'Yields gained by yield bearing DTFs',
    [METRIC.MANAGEMENT_FEES]: 'Some percentage of fee charged on every second basis',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: 'Some percentage of Mint fee+Management fee charged as protocol fee of which 100% goes to RSR buy back and burn',
    [METRIC.STAKING_REWARDS]: 'Part of yields from yield bearing DTFs going to RSR buy back which is distributed among RSR stakers'
  },
  SupplySideRevenue: {
    [METRIC.ASSETS_YIELDS]: 'Yields received by yield DTF holders due to yields from underlying assets, which is realised by periodically melting yield DTFs'
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig,
  methodology,
  breakdownMethodology,
};

export default adapter;
