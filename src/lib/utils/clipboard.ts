/**
 * 텍스트 클립보드 복사 (비보안 컨텍스트 폴백 포함).
 *
 * `navigator.clipboard`는 보안 컨텍스트(HTTPS/localhost)에서만 신뢰성 있게 동작한다.
 * 개발 서버를 LAN IP(http://...)로 접속하면 비보안 컨텍스트라 clipboard API가
 * reject되거나 undefined다.
 *
 * 주의: clipboard API를 먼저 await 한 뒤 폴백을 실행하면, await을 거치며
 * 사용자 제스처(transient activation)가 풀려 execCommand가 true를 반환해도
 * 실제 복사가 안 된다. 따라서 비보안 컨텍스트면 await 없이 곧바로
 * execCommand 폴백을 (클릭 제스처 안에서) 동기 실행한다.
 *
 * @returns 복사 성공 여부
 */
export async function copyText(text: string): Promise<boolean> {
  const secure =
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof navigator !== "undefined" &&
    !!navigator.clipboard?.writeText;

  if (secure) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 폴백으로
    }
  }

  return legacyCopy(text);
}

/** execCommand 기반 폴백 — 사용자 제스처 안에서 동기 실행되어야 한다. */
function legacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;

  const prevActive = document.activeElement as HTMLElement | null;
  // Radix Dialog 등 모달은 focus trap이 걸려 있어, body에 붙인 textarea를
  // focus()하는 순간 포커스를 도로 다이얼로그로 뺏어간다 → 선택이 풀려
  // execCommand가 true를 반환해도 실제 복사가 안 됨. 현재 포커스가 속한
  // 다이얼로그 내부에 textarea를 넣으면 focus trap이 작동하지 않는다.
  // activeElement는 Safari/Firefox에서 버튼 클릭 시 body가 될 수 있으므로,
  // 그 경우 열려있는 다이얼로그(보통 맨 위 하나)를 직접 찾아 폴백한다.
  const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
  const host =
    (prevActive?.closest('[role="dialog"]') as HTMLElement | null) ??
    (dialogs.length ? dialogs[dialogs.length - 1] : null);
  const container: HTMLElement = host ?? document.body;

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", ""); // 모바일 키보드 팝업 방지
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.padding = "0";
  textarea.style.border = "none";
  textarea.style.outline = "none";
  textarea.style.boxShadow = "none";
  textarea.style.background = "transparent";
  textarea.style.opacity = "0";
  container.appendChild(textarea);

  textarea.focus({ preventScroll: true });
  // iOS는 textarea.select()만으로 선택이 안 잡혀 Range로 잡아준다.
  const range = document.createRange();
  range.selectNodeContents(textarea);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
  textarea.setSelectionRange(0, text.length);

  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch {
    ok = false;
  }

  container.removeChild(textarea);
  prevActive?.focus?.({ preventScroll: true }); // 원래 포커스 복원
  return ok;
}
