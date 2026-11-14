import { describe, expect, it } from "vitest";
import { parseYouTubeId } from "../youtube";

describe("유튜브 링크에서 영상 번호 뽑기", () => {
  it.each([
    ["https://youtu.be/cjx0hcdmry8", "cjx0hcdmry8"],
    ["https://youtu.be/cjx0hcdmry8?si=abc123", "cjx0hcdmry8"],
    ["youtu.be/cjx0hcdmry8", "cjx0hcdmry8"],
    ["https://www.youtube.com/watch?v=cjx0hcdmry8", "cjx0hcdmry8"],
    ["https://www.youtube.com/watch?v=cjx0hcdmry8&t=30s", "cjx0hcdmry8"],
    ["https://m.youtube.com/watch?v=cjx0hcdmry8", "cjx0hcdmry8"],
    ["https://www.youtube.com/embed/cjx0hcdmry8", "cjx0hcdmry8"],
    ["https://www.youtube.com/shorts/cjx0hcdmry8", "cjx0hcdmry8"],
    ["https://www.youtube.com/live/cjx0hcdmry8?feature=share", "cjx0hcdmry8"],
    ["  cjx0hcdmry8  ", "cjx0hcdmry8"],
  ])("%s", (input, id) => {
    expect(parseYouTubeId(input)).toBe(id);
  });

  it.each([
    "",
    "그냥 글자",
    "https://vimeo.com/123456789",
    "https://youtube.com/watch?v=short",
    "https://evil.example/watch?v=cjx0hcdmry8",
    "https://www.youtube.com/channel/UCabcdefghijk",
    "javascript:alert(1)",
  ])("못 쓰는 값: %s", (input) => {
    expect(parseYouTubeId(input)).toBeNull();
  });
});
