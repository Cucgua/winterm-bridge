export function useDeviceType(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('mode')) {
    return params.get('mode') === 'mobile';
  }

  const ua = navigator.userAgent;
  const isMobileUA = /iPhone|iPad|iPod|Android|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua);

  // userAgent 明确匹配移动设备 → 手机端
  if (isMobileUA) return true;

  // 屏幕窄 + 有触摸能力 → 大概率是手机/平板
  const isNarrowScreen = window.innerWidth <= 768;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  if (isNarrowScreen && hasTouch) return true;

  return false;
}
