import { BaseAdapter, FetchV2, IJSON, SimpleAdapter } from "../adapters/types";
import { createFactoryExports } from "../factory/registry";
import { CHAIN } from "./chains";
import ADDRESSES from "./coreAssets.json";

const event_trade = 'event Trade(address trader, address subject, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'

export function getFeesExport(FriendtechSharesAddress: string, eventAbis = [event_trade], {
  token = ADDRESSES.null,
}: { token?: string } = {}) {
  return (async ({ getLogs, createBalances, }) => {
    const dailyFees = createBalances()
    const dailyRevenue = createBalances()
    for (const eventAbi of eventAbis) {
      const logs = await getLogs({ target: FriendtechSharesAddress, eventAbi })
      logs.map((e: any) => {
        if (e.protocolEthAmount) {
          dailyFees.add(token, e.protocolEthAmount)
          dailyRevenue.add(token, e.protocolEthAmount)
        }
        if (e.subjectEthAmount) dailyFees.add(token, e.subjectEthAmount)
        if (e.referrerEthAmount) dailyFees.add(token, e.referrerEthAmount)
        if (e.holderEthAmount) dailyFees.add(token, e.holderEthAmount)
      })
    }
    return { dailyFees, dailyRevenue, }
  }) as FetchV2
}

type FriendTechChainConfig = {
  address: string;
  start: string;
  eventAbis?: string[];
  token?: string;
}

const defaultFriendTechMethodology = {
  Fees: "Fees paid by users while trading on social network.",
  Revenue: "Fees paid by users while trading on social network.",
}

function friendTechFeesExports(config: IJSON<FriendTechChainConfig>, overrides?: Partial<SimpleAdapter>) {
  const exportObject: BaseAdapter = {}
  Object.entries(config).map(([chain, chainConfig]) => {
    exportObject[chain] = {
      fetch: getFeesExport(chainConfig.address, chainConfig.eventAbis, { token: chainConfig.token }),
      start: chainConfig.start,
    }
  })
  return { version: 2, adapter: exportObject, methodology: defaultFriendTechMethodology, pullHourly: true, ...overrides } as SimpleAdapter
}

const friendTechEntries: Record<string, any> = {
  sharesgram: {
    [CHAIN.BASE]: { address: '0xbe74a95d159e8e323b8c1a70f825efc85fed27c4', start: '2023-08-28' },
  },
  "post-tech": {
    [CHAIN.ARBITRUM]: { address: '0x2544a6412bc5aec279ea0f8d017fb4a9b6673dca', start: '2023-09-25' },
  },
  "zapper-channels": {
    [CHAIN.BASE]: {
      address: '0xbc98176dc471cb67dc19fa4558104f034d8965fa',
      eventAbis: ['event Trade(address trader,uint256 channelId,bool isBuy,uint256 shareAmount,uint256 totalShares,uint256 ethAmount,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 totalSupply,uint256 channelFeePerShare)'],
      start: '2023-10-02',
    },
  },
  "squa-defi": {
    [CHAIN.BASE]: {
      address: '0xfad362E479AA318F2De7b2c8a1993Df9BB2B3b1f',
      eventAbis: ['event Trade(address indexed trader,address indexed influencer,uint8 indexed direction,uint256 keysAmount,uint256 price,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 keysSupply)'],
      token: ADDRESSES.base.USDC,
      start: '2023-12-22',
    },
  },
  friend3: {
    [CHAIN.ARBITRUM]: {
      address: '0x87da6930626fe0c7db8bc15587ec0e410937e5dc',
      eventAbis: ['event Trade(address trader,address subject,bool isBuy,uint256 shareAmount,uint256 ethAmount,uint256 protocolEthAmount,uint256 subjectEthAmount,uint256 holderEthAmount,uint256 referralEthAmount,uint256 supply)'],
      start: '2023-08-29',
    },
  },
  cipher: {
    [CHAIN.BSC]: {
      address: '0x1e70972ec6c8a3fae3ac34c9f3818ec46eb3bd5d',
      eventAbis: ['event Trade(address trader, address subject, bool isBuy, uint256 ticketAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'],
      start: '2023-08-24',
    },
    [CHAIN.OP_BNB]: {
      address: '0x2C5bF6f0953ffcDE678A35AB7d6CaEBC8B6b29F0',
      eventAbis: ['event Trade (address trader , bytes32 subjectId , bool isBuy , uint256 ticketAmount , uint256 tokenAmount , uint256 protocolEthAmount , uint256 protocolEthAmount , uint256 holderEthAmount , uint256 referrerEthAmount , uint256 supply)'],
      start: '2023-10-31',
    },
  },
  "friend-room": {
    chainConfig: {
      [CHAIN.ETHEREUM]: {
        address: '0x9BD0474CC4F118efe56f9f781AA8f0F03D4e7A9c',
        eventAbis: ['event Trade(uint256 index, uint256 serverId, address trader, uint256 tokenId, bool isBuy, uint256 shareAmount, uint256 ethAmount, uint256 protocolEthAmount, uint256 subjectEthAmount, uint256 supply)'],
        start: '2023-09-03',
      },
    },
    methodology: {
      Fees: 'Buy and create rooms fees paid by users.',
      Revenue: 'Buy and create rooms fees paid by users.',
    },
  },
}

const protocols = {} as any;
Object.entries(friendTechEntries).forEach(([protocolName, entry]: [string, any]) => {
  if (entry.chainConfig) {
    const { chainConfig, ...overrides } = entry
    protocols[protocolName] = friendTechFeesExports(chainConfig, overrides)
  } else {
    protocols[protocolName] = friendTechFeesExports(entry)
  }
})

export const { protocolList, getAdapter } = createFactoryExports(protocols);