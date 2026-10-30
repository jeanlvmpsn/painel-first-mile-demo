import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A aba "Perfil de carga" virou "Capacidade": link salvo com o endereco
  // antigo (e o ?dia=amanha junto, que passa sozinho) continua abrindo.
  async redirects() {
    return [{ source: "/perfil", destination: "/capacidade", permanent: false }];
  },
};

export default nextConfig;
