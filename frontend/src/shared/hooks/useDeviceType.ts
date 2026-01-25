export function useDeviceType(): boolean {
  const params = new URLSearchParams(window.location.search);
  if (params.has('mode')) {
    return params.get('mode') === 'mobile';
  }
  return (
    'ontouchstart' in window ||
    navigator.maxTouchPoints > 0 ||
    /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  );
}
