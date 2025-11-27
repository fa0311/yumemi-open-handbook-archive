export const createSet = <T1>(values: Iterable<T1>, getKey: (item: T1) => string) => {
  const set = Object.fromEntries(Array.from(values).map((item) => [getKey(item), item]));
  const addSet = (...items: T1[]) => {
    for (const item of items) {
      set[getKey(item)] = item;
    }
  };
  const iterator = {
    *[Symbol.iterator]() {
      const ends = new Set<string>([]);
      while (true) {
        const keys = Object.keys(set).filter((key) => !ends.has(key));
        if (keys.length === 0) {
          return;
        }
        for (const key of keys) {
          ends.add(key);
          yield set[key]!;
        }
      }
    },
  };

  const length = () => Object.keys(set).length;

  return { addSet, length, ...iterator };
};
