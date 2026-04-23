import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // standalone 模式把 server + 最小 node_modules 打包到 .next/standalone，
  // 用来构建精简的 prod 运行镜像；对 dev 无副作用。
  output: "standalone",
};

export default nextConfig;
