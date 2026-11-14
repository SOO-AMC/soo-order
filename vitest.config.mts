import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 논문 브리핑 모듈의 순수 로직 테스트 (카드 규격·규칙 생성·원문 대조·발행 조건·라운딩 순환).
// 화면(React)은 브라우저로 확인하고, 여기서는 "한 논문 = 한 장" 같은 규칙이 깨지지 않는지를 본다.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
