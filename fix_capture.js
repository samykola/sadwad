const fs = require('fs');
const path = require('path');

const mainPath = path.join(process.cwd(), 'electron', 'main.js');
let main = fs.readFileSync(mainPath, 'utf8');

// ============================================================
// 1. Replace IS_GENERATING_SCRIPT (relaxed detection)
// ============================================================
const oldGen = [
  'const IS_GENERATING_SCRIPT = `',
  '  !!(',
  '    document.querySelector(\'button[aria-label="Stop"]\') ||',
  '    document.querySelector(\'button[aria-label="Stop response"]\') ||',
  '    document.querySelector(\'button[aria-label="Stop streaming"]\') ||',
  '    document.querySelector(\'div[role="button"][aria-label="Stop"]\') ||',
  '    document.querySelector(\'[data-testid="stop-button"]\')',
  '  )',
  '`;'
].join('\n');

const newGen = [
  'const IS_GENERATING_SCRIPT = `',
  '  (function () {',
  '    var buttons = document.querySelectorAll(\'button, div[role="button"]\');',
  '    for (var i = 0; i < buttons.length; i++) {',
  '      var b = buttons[i];',
  '      var aria = (b.getAttribute(\'aria-label\') || \'\').toLowerCase();',
  '      var tid = (b.getAttribute(\'data-testid\') || \'\').toLowerCase();',
  '      if (aria.indexOf(\'stop\') !== -1) return true;',
  '      if (tid.indexOf(\'stop\') !== -1) return true;',
  '    }',
  '    if (document.querySelector(\'[class*="streaming"]\')) return true;',
  '    if (document.querySelector(\'[class*="generating"]\')) return true;',
  '    return false;',
  '  })();',
  '`;'
].join('\n');

if (main.includes(oldGen)) {
  main = main.replace(oldGen, newGen);
  console.log('✅ IS_GENERATING_SCRIPT relaxed');
} else {
  console.log('⚠️ IS_GENERATING_SCRIPT already patched or not found — skipping');
}

// ============================================================
// 2. Replace tagsClosed + add helpers (hasAnyTag, hasBalancedFences)
// ============================================================
const oldTags = [
  'function tagsClosed(text) {',
  '  const tags = [\'TASKS\', \'CHAT\', \'CODE\'];',
  '  let anyOpen = false;',
  '  for (const t of tags) {',
  '    if (text.includes(\'[[\' + t + \']]\')) {',
  '      anyOpen = true;',
  '      if (!text.includes(\'[[/\' + t + \']]\')) return false;',
  '    }',
  '  }',
  '  return anyOpen;',
  '}'
].join('\n');

const newTags = [
  'function tagsClosed(text) {',
  '  const tags = [\'TASKS\', \'CHAT\', \'CODE\'];',
  '  let anyOpen = false;',
  '  for (const t of tags) {',
  '    const openRe = new RegExp(\'\\\\[\\\\[\\\\s*\' + t + \'\\\\s*\\\\]\\\\]\', \'i\');',
  '    const closeRe = new RegExp(\'\\\\[\\\\[\\\\s*/\\\\s*\' + t + \'\\\\s*\\\\]\\\\]\', \'i\');',
  '    if (openRe.test(text)) {',
  '      anyOpen = true;',
  '      if (!closeRe.test(text)) return false;',
  '    }',
  '  }',
  '  return anyOpen;',
  '}',
  '',
  'function hasAnyTag(text) {',
  '  const tags = [\'TASKS\', \'CHAT\', \'CODE\'];',
  '  for (const t of tags) {',
  '    const openRe = new RegExp(\'\\\\[\\\\[\\\\s*\' + t + \'\\\\s*\\\\]\\\\]\', \'i\');',
  '    if (openRe.test(text)) return true;',
  '  }',
  '  return false;',
  '}',
  '',
  'function hasBalancedFences(text) {',
  '  var count = 0;',
  '  for (var i = 0; i + 2 < text.length; i++) {',
  '    if (text[i] === "`" && text[i+1] === "`" && text[i+2] === "`") {',
  '      count++; i += 2;',
  '    }',
  '  }',
  '  return count >= 2 && count % 2 === 0;',
  '}'
].join('\n');

if (main.includes(oldTags)) {
  main = main.replace(oldTags, newTags);
  console.log('✅ tagsClosed relaxed + helpers added');
} else {
  console.log('⚠️ tagsClosed already patched or not found — skipping');
}

// ============================================================
// 3. Replace the tick function with a robust version
// ============================================================
const tickStartMarker = 'const tick = async () => {';
const tickStart = main.indexOf(tickStartMarker);
if (tickStart === -1) {
  console.error('❌ tick start marker not found');
  process.exit(1);
}

// Find the "};" that closes the tick function, followed by the initial schedule call
const endPattern = '};\n  aiInterval = setTimeout(tick, 300);';
const endIdx = main.indexOf(endPattern, tickStart);
if (endIdx === -1) {
  console.error('❌ tick end pattern not found');
  process.exit(1);
}
const tickEnd = endIdx + 2; // keep "};" in place — replace only the tick body+signature

const newTick = [
  'const TAGS_STABLE = 10;',
  '  const FENCE_STABLE = 10;',
  '  const PLAIN_CHAT_STABLE = 20;',
  '  const MIN_LEN = 20;',
  '  const PLAIN_CHAT_MIN_LEN = 80;',
  '  let lastDiag = 0;',
  '',
  '  const tick = async () => {',
  '    if (!alive()) return;',
  '    if (Date.now() - startTime > 300000) {',
  '      if (lastText && lastText.trim().length > 30) {',
  '        aiInterval = null;',
  '        try { sendToRenderer("bridge:event", { type: "stderr", data: "[poll] TIMEOUT sent best-effort len=" + lastText.length }); } catch (e) {}',
  '        sendToRenderer("ai:web-response", lastText.trim());',
  '        return;',
  '      }',
  '      aiInterval = null;',
  '      sendToRenderer("ai:web-response", "Error: پاسخ از AI دریافت نشد (۵ دقیقه). [poll] در System Logs را چک کنید.");',
  '      return;',
  '    }',
  '    try {',
  '      const isGenerating = await browserWin.webContents.executeJavaScript(IS_GENERATING_SCRIPT);',
  '      if (!alive()) return;',
  '      if (isGenerating) {',
  '        stableCount = 0;',
  '      } else {',
  '        const r = await browserWin.webContents.executeJavaScript(READ_RESPONSE_SCRIPT);',
  '        if (!alive()) return;',
  '        const text = (r && r.text) || "";',
  '        const idx = r ? r.index : -1;',
  '        const isNew = !!r && idx >= 0 && (idx > baseline.index || text !== baseline.text);',
  '        const len = text.trim().length;',
  '        const tagged = hasAnyTag(text);',
  '        const tagsOk = tagged && tagsClosed(text);',
  '        const fencesOk = !tagged && hasBalancedFences(text);',
  '        const plainOk = !tagged && !hasBalancedFences(text) && len >= PLAIN_CHAT_MIN_LEN;',
  '        if (Date.now() - lastDiag > 8000) {',
  '          try {',
  '            sendToRenderer("bridge:event", {',
  '              type: "stdout",',
  '              data: "[poll] idx=" + idx + "/" + baseline.index + " len=" + len +',
  '                    " tagged=" + tagged + " tagsOk=" + tagsOk +',
  '                    " fencesOk=" + fencesOk + " plainOk=" + plainOk +',
  '                    " gen=" + isGenerating',
  '            });',
  '          } catch (e) {}',
  '          lastDiag = Date.now();',
  '        }',
  '        const acceptMode = tagsOk ? "tags" : (fencesOk ? "fences" : (plainOk ? "plain" : null));',
  '        if (isNew && acceptMode) {',
  '          if (text === lastText) {',
  '            stableCount++;',
  '            const need = acceptMode === "tags" ? TAGS_STABLE',
  '                       : acceptMode === "fences" ? FENCE_STABLE',
  '                       : PLAIN_CHAT_STABLE;',
  '            if (stableCount >= need) {',
  '              aiInterval = null;',
  '              try { sendToRenderer("bridge:event", { type: "stdout", data: "[poll] SENT mode=" + acceptMode + " len=" + len }); } catch (e) {}',
  '              sendToRenderer("ai:web-response", text.trim());',
  '              return;',
  '            }',
  '          } else {',
  '            lastText = text; stableCount = 0;',
  '          }',
  '        } else if (text !== lastText) {',
  '          lastText = text; stableCount = 0;',
  '        }',
  '      }',
  '    } catch (e) { console.error("[tick]", e); }',
  '    if (alive()) aiInterval = setTimeout(tick, 300);'
].join('\n');

main = main.substring(0, tickStart) + newTick + main.substring(tickEnd);

fs.writeFileSync(mainPath, main, 'utf8');
console.log('✅ tick function replaced with robust version');

console.log('\n🎉 Done.\n');
console.log('Next:');
console.log('  1) Ctrl+C in terminal');
console.log('  2) npm run dev');
console.log('  3) Kill & Restart Blender');
console.log('  4) Send: "یک ماگ سرامیکی قهوه‌خوری بساز"');
console.log('\nIf still stuck: check System Logs for lines starting with [poll].');