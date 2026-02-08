import { CHAIN } from "../helpers/chains";
import type { SimpleAdapter } from "../adapters/types";
import { aaveExport } from "../helpers/aave";

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    ...aaveExport({
      [CHAIN.ETHEREUM]: {
        start: '2024-03-04',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x3bc3d34c32cc98bf098d832364df8a222bbab4c0',
            dataProvider: '0x47223d4ea966a93b2cc96ffb4d42c22651fadfcf',
          },
          {
            version: 3,
            lendingPoolProxy: '0xCD2b31071119D7eA449a9D211AC8eBF7Ee97F987',
            dataProvider: '0x31063F7CA8ef4089Db0dEdf8D6e35690B468A611',
          },
          {
            version: 3,
            lendingPoolProxy: '0xD3a4DA66EC15a001466F324FA08037f3272BDbE8',
            dataProvider: '0x298ECDcb0369Aef75cBbdA3e46a224Cfe622E287',
          },
        ],
      },
      [CHAIN.BLAST]: {
        start: '2024-03-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xa70b0f3c2470abbe104bdb3f3aaa9c7c54bea7a8',
            dataProvider: '0xc6df4dddbfacb866e78dcc01b813a41c15a08c10',
          },
        ],
      },
      [CHAIN.LINEA]: {
        start: '2024-03-10',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2f9bb73a8e98793e26cb2f6c4ad037bdf1c6b269',
            dataProvider: '0x67f93d36792c49a4493652b91ad4bd59f428ad15',
          },
          {
            version: 3,
            lendingPoolProxy: '0xc6ff96AefD1cC757d56e1E8Dcc4633dD7AA5222D',
            dataProvider: '0x9aFB91a3cfB9aBc8Cbc8429aB57b6593FE36E173',
          },
        ],
      },
      [CHAIN.ERA]: {
        start: '2023-07-17',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x4d9429246ea989c9cee203b43f6d1c7d83e3b8f8',
            dataProvider: '0xb73550bc1393207960a385fc8b34790e5133175e',
          },
        ],
      },
      [CHAIN.MANTA]: {
        start: '2024-01-01',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2f9bb73a8e98793e26cb2f6c4ad037bdf1c6b269',
            dataProvider: '0x67f93d36792c49a4493652b91ad4bd59f428ad15',
          },
        ],
      },
      [CHAIN.BASE]: {
        start: '2024-09-24',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x766f21277087E18967c1b10bF602d8Fe56d0c671',
            dataProvider: '0xA754b2f1535287957933db6e2AEE2b2FE6f38588',
          },
        ],
      },
      [CHAIN.ZIRCUIT]: {
        start: '2024-09-05',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x2774C8B95CaB474D0d21943d83b9322Fb1cE9cF5',
            dataProvider: '0xA754b2f1535287957933db6e2AEE2b2FE6f38588',
          },
        ],
      },
      // [CHAIN.XLAYER]: {
      //   start: '2024-08-26',
      //   pools: [
      //     {
      //       version: 3,
      //       lendingPoolProxy: '0xffd79d05d5dc37e221ed7d3971e75ed5930c6580',
      //       dataProvider: '0x97e59722318f1324008484aca9c343863792cbf6',
      //     },
      //   ],
      // },
      [CHAIN.CORN]: {
        start: '2024-12-11',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x927b3A8e5068840C9758b0b88207b28aeeb7a3fd',
            dataProvider: '0x2f7e54ff5d45f77bFfa11f2aee67bD7621Eb8a93',
          },
        ],
      },
      [CHAIN.BERACHAIN]: {
        start: '2025-02-11',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xE96Feed449e1E5442937812f97dB63874Cd7aB84',
            dataProvider: '0x26416E170aDb35B0d23800602cf98853dBDeB74F',
          },
        ],
      },
      [CHAIN.ABSTRACT]: {
        start: '2025-05-14',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0x7C4baE19949D77B7259Dc4A898e64DC5c2d10b02',
            dataProvider: '0x8EEAE4dD40EBee7Bb6471c47d4d867539CF53ccF',
          },
        ],
      },
      [CHAIN.HEMI]: {
        start: '2025-03-12',
        pools: [
          {
            version: 3,
            lendingPoolProxy: '0xdB7e029394a7cdbE27aBdAAf4D15e78baC34d6E8',
            dataProvider: '0x9698FdF843cbe4531610aC231B0047d9FFc13bC6',
          },
        ],
      },
    })
  }
}

export default adapter
