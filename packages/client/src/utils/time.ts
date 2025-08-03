/**
 * 時間形式文字列を秒数に変換する関数
 *
 * 対応形式:
 *   - "1d"   : 日（1日=86400秒）
 *   - "2h"   : 時間（1時間=3600秒）
 *   - "30m"  : 分（1分=60秒）
 *   - "10s"  : 秒
 *   - 複合指定（例: "1d2h30m10s"）も可
 *   - 数値のみ（例: "120"）はそのまま秒数として扱う
 *   - 空文字や不正な形式はデフォルト（1時間=3600秒）
 *
 * @param timeStr 例: "1d2h30m10s", "120", "2h"
 * @returns 秒数
 */
export function parseTimeToSeconds(timeStr: string): number {
  const defaultSeconds = 3600 // デフォルト: 1時間

  if (!timeStr) return defaultSeconds

  // 数値のみの場合は秒数として解釈
  if (/^\d+$/.test(timeStr)) {
    return parseInt(timeStr, 10)
  }

  // 時間表記（例: 1d, 1h, 30m, 10s）を解釈
  const days = timeStr.match(/(\d+)d/)
  const hours = timeStr.match(/(\d+)h/)
  const minutes = timeStr.match(/(\d+)m/)
  const seconds = timeStr.match(/(\d+)s/)

  let totalSeconds = 0
  if (days) totalSeconds += parseInt(days[1], 10) * 86400
  if (hours) totalSeconds += parseInt(hours[1], 10) * 3600
  if (minutes) totalSeconds += parseInt(minutes[1], 10) * 60
  if (seconds) totalSeconds += parseInt(seconds[1], 10)

  // "0s"のみは0秒を返す
  if (timeStr === '0s') return 0
  // それ以外で合計0秒の場合はデフォルト値
  return totalSeconds > 0 ? totalSeconds : defaultSeconds
}
