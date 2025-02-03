import * as sdk from "@defillama/sdk";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import request from "graphql-request";

const SHADOW_ADDRESS = "0x3333b97138d4b086720b5ae8a7844b1345a33333"
const XSHADOW_ADDRESS = "0x5050bc082ff4a74fb6b0b04385defddb114b2424"

type TStartTime = {
  [key: string]: number;
};

const startTimeV2: TStartTime = {
  [CHAIN.SONIC]: 1735129946,
};

const v2Endpoints: any = {
  [CHAIN.SONIC]:
    sdk.graph.modifyEndpoint('HGyx7TCqgbWieay5enLiRjshWve9TjHwiug3m66pmLGR'),
};

interface IPool {
  volumeUSD: string;
  feesUSD: string;
}

const fetchBribes = async (options: FetchOptions) => {
  const { getLogs } = options
  let bribes = 0

  const period = Math.floor(options.startOfDay / 604800)
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()

  const gaugeCreatedLogs = await getLogs({
    targets: ["0x3aF1dD7A2755201F8e2D6dCDA1a61d9f54838f4f", "0xf914Cc768040B4268A779C3084a3E9cdA6E8a1A8"],
    eventAbi: "event GaugeCreated(address indexed pool, address gauge)",
    fromBlock: 4028273,
    cacheInCloud: true,
  })

  const gaugeAddresses = gaugeCreatedLogs.map((log) => log[1] as string)

  const logs = await getLogs({
    targets: gaugeAddresses,
    eventAbi: "event NotifyReward(address indexed from, address indexed reward, uint256 amount, uint256 period)",
    fromBlock,
    toBlock,
  })

  const periodLogs = logs.filter((log) => Number(log[3]) === period)

  const tokens: { [key:string]: bigint } = {
    [SHADOW_ADDRESS]: BigInt(0)
  }

  for (const log of periodLogs) {
    const addr = log[1].toLowerCase()

    if (!tokens[addr]) {
      tokens[addr] = BigInt(0)
    }

    tokens[addr] += log[2]
  }

  const query = `
    {
      tokenDayDatas (
        where: { token_in: ["${Object.keys(tokens).join('", "')}"] },
        startOfDay_lte: ${options.startOfDay},
        orderBy: startOfDay
        orderDirection: desc
      ) {
        token { id, decimals }
        priceUSD
      }
    }
  `

  const res = await request(v2Endpoints[options.chain], query)

  const shadowPrice = Number(res.tokenDayDatas.find((row: any) => row.token.id === SHADOW_ADDRESS).priceUSD)

  for (const [tokenAddress, amount] of Object.entries(tokens)) {
    const isXShadow = tokenAddress === XSHADOW_ADDRESS
    const tokenDayData = res.tokenDayDatas.find((row: any) => row.token.id === tokenAddress)
    const tokenPrice = isXShadow ? shadowPrice : Number(tokenDayData.priceUSD)
    const tokenDecimals = isXShadow ? 18 : tokenDayData.token.decimals

    bribes += Number(amount) / (10 ** tokenDecimals) * tokenPrice
  }

  return { bribes }
}

const fetch = async (options: FetchOptions) => {
  const query = `
    {
      clPoolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
        volumeUSD
        feesUSD
      }
      legacyPoolDayDatas(where:{startOfDay: ${options.startOfDay}}) {
        volumeUSD
        feesUSD
      }
    }
  `;

  const { bribes } = await fetchBribes(options)

  const res = await request(v2Endpoints[options.chain], query);
  const pools: IPool[] = [...res.clPoolDayDatas, ...res.legacyPoolDayDatas];
  const dailyVolume = pools.reduce((acc, pool) => acc + Number(pool.volumeUSD), 0);
  const dailyFees = bribes + pools.reduce((acc, pool) => acc + Number(pool.feesUSD), 0)

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  };

}

const methodology = {
  UserFees: "User pays 0.3% fees on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};
const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SONIC]: {
      fetch,
      start: startTimeV2[CHAIN.SONIC],
      meta: {
        methodology: methodology
      },
    },
  },
};

export default adapter;
