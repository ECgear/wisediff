/**
 * encoding.js — ファイル読込時の文字コード自動判定とデコード（純関数・依存ゼロ）。
 *
 * ブラウザ/Node 標準の TextDecoder のみを使用（shift_jis / euc-jp / iso-2022-jp / utf-16 対応）。
 * Shift_JIS の CSV などが文字化けしないよう、BOM → ISO-2022-JP → UTF-8 妥当性 → 和文レガシー推定
 * の順で判定する。和文推定は「ひらがな/カタカナ/漢字を多く含む候補ほど良い」というスコアで選ぶ。
 *
 * @license MIT
 * Copyright (c) 2026 ECgear
 */

function decodeAs(bytes, label, fatal) {
  return new TextDecoder(label, { fatal: !!fatal }).decode(bytes);
}

/**
 * デコード結果の「もっともらしさ」を採点（小さいほど良い）。
 * 置換文字・異常な制御文字を強く減点し、和文/印字可能 ASCII を加点する。
 * これにより、単バイトが常に有効になりがちな Shift_JIS が誤って優先されるのを防ぐ。
 */
function score(text) {
  let bad = 0, good = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 0xFFFD) { bad += 3; continue; }                       // 置換文字（デコード失敗）
    if (c < 0x09 || (c > 0x0D && c < 0x20)) { bad += 3; continue; } // 異常な制御文字
    if (c >= 0xFF61 && c <= 0xFF9F) { bad += 1; continue; }         // 半角カナ（誤判定の典型）
    if ((c >= 0x3040 && c <= 0x30FF) ||                             // ひらがな・カタカナ
        (c >= 0x4E00 && c <= 0x9FFF) ||                             // CJK 統合漢字
        (c >= 0x20 && c <= 0x7E) ||                                 // 印字可能 ASCII
        (c >= 0xFF00 && c <= 0xFF60) || (c >= 0xFFA0 && c <= 0xFFEF)) { // 全角英数等
      good += 1;
    }
  }
  return bad * 1000 - good;
}

function isAscii(bytes) {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] > 0x7F) return false;
  return true;
}

function hasIso2022Jp(bytes) {
  for (let i = 0; i + 2 < bytes.length; i++) {
    if (bytes[i] !== 0x1B) continue; // ESC
    const a = bytes[i + 1], b = bytes[i + 2];
    if (a === 0x24 && (b === 0x40 || b === 0x42)) return true;            // ESC $ @ / ESC $ B
    if (a === 0x28 && (b === 0x42 || b === 0x4A || b === 0x49)) return true; // ESC ( B / J / I
  }
  return false;
}

/**
 * ArrayBuffer / Uint8Array を文字コード判定してデコードする。
 * @param {ArrayBuffer|Uint8Array} buf
 * @returns {{ text: string, encoding: string }}
 */
export function detectAndDecode(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

  // 1) BOM 判定（最優先・確実）
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) {
    return { text: decodeAs(bytes.subarray(3), 'utf-8'), encoding: 'utf-8' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) {
    return { text: decodeAs(bytes.subarray(2), 'utf-16le'), encoding: 'utf-16le' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) {
    return { text: decodeAs(bytes.subarray(2), 'utf-16be'), encoding: 'utf-16be' };
  }

  // 2) ISO-2022-JP（7bit・ESC エスケープ列を含む）
  if (hasIso2022Jp(bytes)) {
    try { return { text: decodeAs(bytes, 'iso-2022-jp'), encoding: 'iso-2022-jp' }; } catch { /* fallthrough */ }
  }

  // 3) 純 ASCII はどの符号化でも同一
  if (isAscii(bytes)) return { text: decodeAs(bytes, 'utf-8'), encoding: 'ascii' };

  // 4) UTF-8 として妥当か（fatal）。妥当なら UTF-8 確定。
  try { return { text: decodeAs(bytes, 'utf-8', true), encoding: 'utf-8' }; } catch { /* not utf-8 */ }

  // 5) 和文レガシーを推定（スコア最小を採用。同点は候補順 = shift_jis 優先）
  let best = null;
  for (const label of ['shift_jis', 'euc-jp', 'utf-8']) {
    let text;
    try { text = decodeAs(bytes, label); } catch { continue; }
    const s = score(text);
    if (best === null || s < best.s) best = { text, encoding: label, s };
  }
  return best ? { text: best.text, encoding: best.encoding } : { text: decodeAs(bytes, 'utf-8'), encoding: 'utf-8' };
}
