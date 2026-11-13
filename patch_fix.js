const fs = require('fs');
const path = require('path');

const file = path.join(process.cwd(), 'src', 'components', 'MainPanel.tsx');
let content = fs.readFileSync(file, 'utf8');

const target = `        if (hasCode && codeContent.length < 20) { hasCode = false; codeContent = ''; }

        // --- استخراج پلان تسک‌ها ---`;

const replacement = `        if (hasCode && codeContent.length < 20) { hasCode = false; codeContent = ''; }

        // --- NEW: اعتبارسنجی کد برای جلوگیری از کدهای ناقص (مثل قطع شدن وسط خروجی) ---
        if (hasCode && codeContent) {
          const count = (str: string, char: string) => (str.split(char).length - 1);
          const balanced = count(codeContent, '(') === count(codeContent, ')') &&
                           count(codeContent, '[') === count(codeContent, ']') &&
                           count(codeContent, '{') === count(codeContent, '}');
          if (!balanced) {
            hasCode = false;
            const fixPrompt = 'Your previous code was cut off or incomplete (unbalanced parentheses/brackets). Provide the COMPLETE Python code for the current task. Reply with ONLY [[CODE]]...[[/CODE]].';
            scheduleNext(fixPrompt, '🛠 کد ناقص بود، درخواست ارسال مجدد...');
            return; // کد ناقص رو به بلندر نفرست
          }
        }

        // --- استخراج پلان تسک‌ها ---`;

if (!content.includes(target)) {
  console.error('❌ Target block not found in MainPanel.tsx!');
  process.exit(1);
}

content = content.replace(target, replacement);
fs.writeFileSync(file, content, 'utf8');
console.log('✅ MainPanel.tsx patched successfully!');