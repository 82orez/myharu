import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // ⚠️ 기본값 1MB는 MAX_AUDIO_BYTES(10MB)와 어긋나 1MB 넘는 오디오가 saveSentence/updateSentence
    //    진입 전에 프레임워크 단에서 잘렸다. base64는 원본보다 ~33% 크므로 여유를 둔다.
    //    ※ Vercel 서버리스 요청 본문 4.5MB 벽은 이 설정으로 넘을 수 없다(클라이언트에서 별도 안내).
    serverActions: { bodySizeLimit: "16mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
        ],
      },
    ];
  },
};

export default nextConfig;
