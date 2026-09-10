// 层级 query key：域内列表/详情在各自域文件里继续向下扩展（如 ["auth", "me"]）。
export const authQueryKeys = {
  all: ["auth"] as const,
  me: ["auth", "me"] as const,
};
