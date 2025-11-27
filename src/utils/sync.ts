export const syncLoop = async <T1, T2>(items: Iterable<T1>, callback: (item: T1) => Promise<T2>) => {
  const res: T2[] = [];
  for (const item of items) {
    res.push(await callback(item));
  }
  return res;
};

export const doWhileSync = async (callback: () => Promise<boolean>) => {
  let res = await callback();
  while (res) {
    res = await callback();
  }
};
