const fs = require('fs');
const path = require('path');

// ============================================================
// PART 1: Add parameter aliases to ALL omni_lib primitives
// ============================================================
const libPath = path.join(process.cwd(), 'bridge', 'omni_lib.py');
let lib = fs.readFileSync(libPath, 'utf8');

const patches = [
  // ---- lathe ----
  {
    from: 'def lathe(name, prof, loc, m=None, segs=48, rot=None, bevel=0.0):\n    bm = bmesh.new(); n=len(prof); rows=[]',
    to: 'def lathe(name, prof, loc, m=None, segs=48, rot=None, bevel=0.0, **kwargs):\n    for _k in ("segments","vertices","verts","resolution","steps","sides"):\n        if _k in kwargs: segs = kwargs[_k]; break\n    segs = max(3, int(segs))\n    bm = bmesh.new(); n=len(prof); rows=[]'
  },
  // ---- sphere ----
  {
    from: 'def sphere(name, r, loc, m=None, scale=(1, 1, 1), segs=32, rot=None):\n    bm = bmesh.new();',
    to: 'def sphere(name, r, loc, m=None, scale=(1, 1, 1), segs=32, rot=None, **kwargs):\n    for _k in ("radius","radius1","size"):\n        if _k in kwargs: r = kwargs[_k]; break\n    for _k in ("segments","vertices","verts","resolution","sides"):\n        if _k in kwargs: segs = kwargs[_k]; break\n    segs = max(3, int(segs))\n    bm = bmesh.new();'
  },
  // ---- torus ----
  {
    from: 'def torus(name, R, r, loc, m=None, rot=None, ms=48, ns=16):\n    bm = bmesh.new();',
    to: 'def torus(name, R, r, loc, m=None, rot=None, ms=48, ns=16, **kwargs):\n    if "major_segments" in kwargs: ms = kwargs["major_segments"]\n    if "minor_segments" in kwargs: ns = kwargs["minor_segments"]\n    if "major_radius" in kwargs: R = kwargs["major_radius"]\n    if "minor_radius" in kwargs: r = kwargs["minor_radius"]\n    if "radius" in kwargs: R = kwargs["radius"]\n    if "tube_radius" in kwargs: r = kwargs["tube_radius"]\n    if "segments" in kwargs: ms = kwargs["segments"]\n    ms = max(3, int(ms)); ns = max(3, int(ns))\n    bm = bmesh.new();'
  },
  // ---- polyext ----
  {
    from: 'def polyext(name, pts, depth, loc, m=None, bevel=0.01, rot=None, seg=3):\n    bm = bmesh.new();',
    to: 'def polyext(name, pts, depth, loc, m=None, bevel=0.01, rot=None, seg=3, **kwargs):\n    if "extrude" in kwargs: depth = kwargs["extrude"]\n    if "extrude_depth" in kwargs: depth = kwargs["extrude_depth"]\n    if "thickness" in kwargs: depth = kwargs["thickness"]\n    if "segments" in kwargs: seg = kwargs["segments"]\n    bm = bmesh.new();'
  },
  // ---- box ----
  {
    from: 'def box(name, size, loc, m=None, bevel=0.01, rot=None, seg=3):\n    bm = bmesh.new();',
    to: 'def box(name, size, loc, m=None, bevel=0.01, rot=None, seg=3, **kwargs):\n    if "dimensions" in kwargs: size = kwargs["dimensions"]\n    if "dims" in kwargs: size = kwargs["dims"]\n    if "segments" in kwargs: seg = kwargs["segments"]\n    bm = bmesh.new();'
  },
  // ---- tube ----
  {
    from: "def tube(name, pts, radius, m=None, loc=(0, 0, 0), res=8):\n    cu = bpy.data.curves.new(name, 'CURVE');",
    to: "def tube(name, pts, radius, m=None, loc=(0, 0, 0), res=8, **kwargs):\n    if 'resolution' in kwargs: res = kwargs['resolution']\n    if 'segments' in kwargs: res = kwargs['segments']\n    if 'bevel_resolution' in kwargs: res = kwargs['bevel_resolution']\n    if 'thickness' in kwargs: radius = kwargs['thickness']\n    cu = bpy.data.curves.new(name, 'CURVE');"
  }
];

let applied = 0;
for (const p of patches) {
  if (lib.includes(p.from)) {
    lib = lib.replace(p.from, p.to);
    applied++;
  } else {
    console.log('⚠️ Skipped (already patched): ' + p.from.split('\n')[0]);
  }
}
fs.writeFileSync(libPath, lib, 'utf8');
console.log('✅ omni_lib.py: ' + applied + '/' + patches.length + ' primitives updated');

// ============================================================
// PART 2: Guard against AI echoing the system prompt
// ============================================================
const mainPath = path.join(process.cwd(), 'src', 'components', 'MainPanel.tsx');
let main = fs.readFileSync(mainPath, 'utf8');

const target = '        if (textContent.length > 0) pushMessage({ role: \'assistant\', content: textContent });';

const replacement = [
  '        // --- Guard: reject system prompt echo (AI sometimes copies it back) ---',
  '        const isPromptEcho = textContent.length > 500 && (',
  '          textContent.includes("ABSOLUTE PROFESSIONAL RULES") ||',
  '          textContent.includes("You are a Principal 3D Technical Artist") ||',
  '          (textContent.includes("OUTPUT FORMAT (strict)") && textContent.includes("GOLDEN EXAMPLE"))',
  '        );',
  '        if (isPromptEcho && !planJustParsed && retryCount.current < MAX_RETRIES) {',
  '          retryCount.current++;',
  '          scheduleNext(',
  '            "STOP. Your previous response echoed the system prompt verbatim. Respond ONLY with [[TASKS]]...[[/TASKS]] for the plan, then code in [[CODE]]...[[/CODE]] for the CURRENT task. Do NOT repeat any rules.",',
  '            "↻ AI پرامپت رو تکرار کرد، درخواست مجدد..."',
  '          );',
  '          return;',
  '        }',
  '',
  '        if (textContent.length > 0) pushMessage({ role: \'assistant\', content: textContent });'
].join('\n');

if (!main.includes(target)) {
  console.error('❌ MainPanel.tsx target not found');
  process.exit(1);
}
main = main.replace(target, replacement);
fs.writeFileSync(mainPath, main, 'utf8');
console.log('✅ MainPanel.tsx: prompt-echo guard added');

console.log('\n🎉 Done. Next:');
console.log('  1) Ctrl+C in terminal');
console.log('  2) npm run dev');
console.log('  3) Kill & Restart Blender');
console.log('  4) Send the mug prompt again');