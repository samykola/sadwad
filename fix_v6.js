
const fs = require('fs');
const path = require('path');

// ============================================================
// PART 1: omni_lib.py — fix subsurf to accept string names
// ============================================================
const libPath = path.join(process.cwd(), 'bridge', 'omni_lib.py');
let lib = fs.readFileSync(libPath, 'utf8');

const oldSubsurf = [
  'def subsurf(obj, levels=2):',
  '    """Smooth any mesh with subdivision surface."""',
  '    if obj.type != \'MESH\': return obj',
  '    s = obj.modifiers.new(\'Subsurf\', \'SUBSURF\')',
  '    s.levels = levels',
  '    s.render_levels = levels',
  '    _autosmooth(obj, 80)',
  '    return obj'
].join('\n');

const newSubsurf = [
  'def subsurf(obj, levels=2):',
  '    """Smooth any mesh with subdivision surface. Accepts object or name."""',
  '    if isinstance(obj, str):',
  '        o = bpy.data.objects.get(obj)',
  '        if o is None:',
  '            print(f"[subsurf] object not found: {obj}")',
  '            return None',
  '        obj = o',
  '    if obj.type != "MESH":',
  '        print(f"[subsurf] {obj.name} is {obj.type}, skipping")',
  '        return obj',
  '    s = obj.modifiers.new("Subsurf", "SUBSURF")',
  '    s.levels = levels',
  '    s.render_levels = levels',
  '    _autosmooth(obj, 80)',
  '    return obj'
].join('\n');

if (lib.includes(oldSubsurf)) {
  lib = lib.replace(oldSubsurf, newSubsurf);
  console.log('✅ omni_lib.subsurf: accepts string names now');
} else {
  console.log('⚠️ subsurf patch skipped (already patched or not found)');
}

// Also fix handle_attached if it exists to use safe get
if (lib.includes('def handle_attached(')) {
  lib = lib.replace(
    '    B = get(body_ref) if isinstance(body_ref, str) else body_ref',
    '    B = (bpy.data.objects.get(body_ref) if isinstance(body_ref, str) else body_ref)\n    if B is None:\n        raise ValueError("handle_attached: body not found: " + str(body_ref))'
  );
  console.log('✅ handle_attached: safe get');
}

fs.writeFileSync(libPath, lib, 'utf8');

// ============================================================
// PART 2: omni_edit.py — add apply_bevel_to_sharp
// ============================================================
const editPath = path.join(process.cwd(), 'bridge', 'omni_edit.py');
let ed = fs.readFileSync(editPath, 'utf8');

if (!ed.includes('def apply_bevel_to_sharp(')) {
  const powerToolsPos = ed.indexOf('    # ───── POWER TRANSFORMS ─────');
  const bevelTool = [
    '    def apply_bevel_to_sharp(self, angle_deg=30, width=0.001, segments=2):',
    '        """Convenience: bevel all edges whose dihedral angle > angle_deg."""',
    '        es = self.edges(sharp=angle_deg)',
    '        if len(es) > 0:',
    '            return self.bevel(es, width, segments=segments)',
    '        return self._done("apply_bevel_to_sharp", None, "0 edges")',
    '',
    ''
  ].join('\n');

  if (powerToolsPos !== -1) {
    ed = ed.substring(0, powerToolsPos) + bevelTool + ed.substring(powerToolsPos);
  } else {
    // Fallback: insert before # ───── VIEW / DEBUG ─────
    const viewPos = ed.indexOf('    # ───── VIEW / DEBUG ─────');
    if (viewPos !== -1) {
      ed = ed.substring(0, viewPos) + bevelTool + ed.substring(viewPos);
    }
  }
  fs.writeFileSync(editPath, ed, 'utf8');
  console.log('✅ omni_edit.apply_bevel_to_sharp: added');
} else {
  console.log('⚠️ apply_bevel_to_sharp already exists');
}

// ============================================================
// PART 3: MainPanel.tsx — organic modeling rules + knight example
// ============================================================
const mainPath = path.join(process.cwd(), 'src', 'components', 'MainPanel.tsx');
let main = fs.readFileSync(mainPath, 'utf8');

// 3a. Add ORGANIC vs HARD SURFACE rule
const ruleMarker = '--- ABSOLUTE PROFESSIONAL RULES (DO NOT BREAK) ---';
if (!main.includes('ORGANIC vs HARD SURFACE')) {
  main = main.replace(
    ruleMarker,
    ruleMarker + '\nORGANIC vs HARD SURFACE (CRITICAL):\n- ORGANIC (creature, animal, human, horse head, bird, monster): Build with skin_chain() or limb() and subsurf(). NEVER boolean-union separate spheres/cylinders to fake an organic shape — it produces a melted blob.\n- HARD SURFACE (mug, phone, weapon, architecture, mechanical): Build with boxes/cyl/lathe, then boolean_union() for fusing. Do not subsurf these.\n'
  );
  console.log('✅ Organic vs Hard Surface rule added');
}

// 3b. Add Golden Example 3 for Knight
const gold2Marker = "print(edit_report(\"Mug_Body\"))";
if (!main.includes('GOLDEN EXAMPLE 3: Chess Knight')) {
  // find the exact line we used in fix_v5
  const searchGold = 'cyl("Coffee", 0.0355, 0.045, (0,0,0.0275), coffee)';
  if (main.includes(searchGold)) {
    const knightExample = [
      searchGold,
      '',
      '--- GOLDEN EXAMPLE 3: Chess Knight (ORGANIC, uses skin_chain not boolean) ---',
      'wood = mat("Wood", (0.2, 0.1, 0.05), rough=0.4)',
      '# 1. Base + column (hard surface — boolean ok)',
      'cyl("Base", 0.03, 0.02, (0,0,0.01), wood, bevel=0.003)',
      'cyl("Column", 0.025, 0.08, (0,0,0.06), wood)',
      'boolean_union("Base", "Column")',
      '# 2. Horse neck+head as ONE skin_chain (organic, smooth curve)',
      'joints = [',
      '    (0, 0, 0.10, 0.020),  # base of neck',
      '    (0, -0.01, 0.13, 0.018),  # mid neck',
      '    (0, -0.025, 0.15, 0.022),  # head base',
      '    (0, -0.045, 0.155, 0.018),  # forehead',
      '    (0, -0.06, 0.148, 0.012),  # muzzle',
      '    (0, -0.07, 0.145, 0.008),  # nose tip',
      ']',
      'skin_chain("HorseHead", joints, wood, levels=2)',
      '# 3. Fuse base + horse head',
      'boolean_union("Base", "HorseHead")',
      'print(edit_report("Base"))'
    ].join('\n');
    main = main.replace(searchGold, knightExample);
    console.log('✅ Golden Knight example added');
  }
}

// 3c. Document apply_bevel_to_sharp is real now
const helperDocMarker = '- e.apply_bevel_to_sharp(angle_deg=30, width=0.001)  — auto bevel sharp edges';
if (main.includes(helperDocMarker)) {
  // already documented
} else {
  // add it to power tools list if not present
  const powerDocMarker = '- e.delete_loose()                      — remove stray verts';
  if (main.includes(powerDocMarker)) {
    main = main.replace(powerDocMarker, powerDocMarker + '\n- e.apply_bevel_to_sharp(angle_deg=30, width=0.001) — bevel all sharp edges');
  }
}

fs.writeFileSync(mainPath, main, 'utf8');
console.log('✅ MainPanel.tsx: organic rule + knight example');

console.log('\n🎉 fix_v6 applied!');
console.log('\nNext:');
console.log('  1) Ctrl+C in terminal');
console.log('  2) npm run dev');
console.log('  3) Kill & Restart Blender');
console.log('  4) Send: "یک اسب شطرنج بساز"');