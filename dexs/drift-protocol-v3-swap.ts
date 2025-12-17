import adapter from "./drift-protocol-v3";
const { breakdown, ...rest } = adapter;

export default {
  ...rest,
  adapter: breakdown["swap"],
};
