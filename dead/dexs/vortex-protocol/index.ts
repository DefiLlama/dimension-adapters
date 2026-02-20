import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fethcEmpty = async () => {
  throw new Error('This is dead')
}

const adapter: SimpleAdapter = {
  deadFrom: '2024-11-24',
  adapter: {
    [CHAIN.TEZOS]: {
      fetch:  fethcEmpty,
      start: 1647604761,
    }
  },
};

export default adapter;
