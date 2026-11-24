/**
 * 앱을 켤 때 나오는 시작 화면(애니메이션).
 *
 * 홈 화면 아이콘으로 앱을 열면 안드로이드·iOS 가 먼저 자기 시작 화면(흰 바탕 + 아이콘)을 그린다.
 * 그 화면은 manifest 의 색·아이콘으로만 정해지고 움직일 수 없어서, 페이지가 뜨는 순간
 * 이 화면이 이어받아 로고가 살아나는 애니메이션을 보여 주고 사라진다.
 * 첫 장면을 그 시작 화면과 똑같이(로고·글자 위치와 크기) 그려서 넘어갈 때 튀지 않게 한다 — 값은 globals.css.
 *
 * - 설치한 앱(standalone)으로 열었을 때만, 앱을 켤 때마다 한 번(sessionStorage)
 * - 움직임 줄이기 설정이면 안 보임, 누르면 바로 넘어감
 * - 브라우저에서 확인할 때는 주소 뒤에 ?splash=1
 * - React 가 그린 요소는 건드리지 않고 <html> 의 class 만 바꾼다(하이드레이션 경고 방지)
 *
 * "use client" 가 아니다 — 서버 레이아웃에서 그대로 그린다.
 */

const SEEN_KEY = "soo-splash-seen";

/** <head> 에서 그리기 전에 실행: 보여 줄지 정해 <html> 에 splash-on 을 붙인다 */
export const SPLASH_INIT_SCRIPT = `(function(){try{var q=/[?&]splash=1/.test(location.search);var sa=window.matchMedia("(display-mode: standalone)").matches||navigator.standalone===true;if(!q){if(!sa)return;if(sessionStorage.getItem("${SEEN_KEY}"))return;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches)return;if(location.pathname.indexOf("/briefing/rounding")===0)return;}sessionStorage.setItem("${SEEN_KEY}","1");document.documentElement.classList.add("splash-on");}catch(_){}})();`;

/** 시작 화면이 끝나면 물러나게 한다 (누르면 바로) */
const SPLASH_RUN_SCRIPT = `(function(){var e=document.documentElement;if(!e.classList.contains("splash-on"))return;var done=false;function out(){if(done)return;done=true;e.classList.add("splash-out");setTimeout(function(){e.classList.remove("splash-on","splash-out");},420);}var t=setTimeout(out,1700);var el=document.getElementById("app-splash");if(el)el.addEventListener("click",function(){clearTimeout(t);out();});})();`;

export function AppSplash() {
  return (
    <>
      <div id="app-splash" aria-hidden="true">
        <div className="splash-glow splash-glow-a" />
        <div className="splash-glow splash-glow-b" />
        <div className="splash-mark">
          <span className="splash-ring" />
          <span className="splash-ring splash-ring-2" />
          <div className="splash-tile">
            <span className="splash-tile-bg" />
            <span className="splash-tile-clip">
              {/* eslint-disable-next-line @next/next/no-img-element -- 하이드레이션 전에 바로 그려야 해서 next/image 를 쓰지 않는다 */}
              <img src="/sooorder-brand/splash-icon.webp" alt="" width={448} height={448} />
              <span className="splash-shine" />
            </span>
          </div>
        </div>
        <p className="splash-name">수오더</p>
        <p className="splash-tagline">의약품 주문 · 검수</p>
        <div className="splash-bar">
          <span />
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: SPLASH_RUN_SCRIPT }} />
    </>
  );
}
