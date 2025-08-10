/**
 * モバイルデバイスかどうかを判定する
 * @returns モバイルデバイスの場合はtrue、それ以外はfalse
 */
export const isMobileDevice = () => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)
}
