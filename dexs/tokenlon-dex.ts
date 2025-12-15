import adapter from '../dexs/tokenlon';
const { breakdown, ...rest } = adapter;

export default {
  ...rest,
  adapter: breakdown['tokenlon'],
};
