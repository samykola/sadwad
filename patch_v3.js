const fs = require('fs');
const path = require('path');

function write(filePath, content) {
  const full = path.join(process.cwd(), filePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('✅ ' + filePath);
}

// ============================================================
// 1. Add boolean_union + fix cyl in omni_lib.py
// ============================================================
const omniLibPath = path.join(process.cwd(), 'bridge', 'omni_lib.py');
let omniLib = fs.readFileSync(omniLibPath, 'utf8');

// --- Fix cyl() to accept aliases for segs ---
const oldCyl = `def cyl(name, r, h, loc, m=None, r2=None, segs=32, bevel=0.0, rot=None, seg=3):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=(r if r2 is None else r2), depth=h)
    o = _bm_obj(name, bm, loc, rot)
    return _dress(o, m, bevel, seg)`;

const newCyl = `def cyl(name, r, h, loc, m=None, r2=None, segs=32, bevel=0.0, rot=None, seg=3, **kwargs):
    # Accept common aliases used by AI: verts, vertices, segments, sides
    if 'verts' in kwargs: segs = kwargs['verts']
    if 'vertices' in kwargs: segs = kwargs['vertices']
    if 'segments' in kwargs: segs = kwargs['segments']
    if 'sides' in kwargs: segs = kwargs['sides']
    segs = max(3, int(segs))
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=(r if r2 is None else r2), depth=h)
    o = _bm_obj(name, bm, loc, rot)
    return _dress(o, m, bevel, seg)`;

if (!omniLib.includes(oldCyl)) {
  console.error('❌ Could not find cyl() signature in omni_lib.py');
  process.exit(1);
}
omniLib = omniLib.replace(oldCyl, newCyl);

// --- Add boolean_union at end of omni_lib.py ---
const booleanHelper = `

# ============ BOOLEAN (robust via depsgraph) ============

def boolean_union(a, b, solver='EXACT', hide_b=True):
    """Union b into a. Returns a. Works reliably across Blender contexts.
    Uses depsgraph evaluation (no bpy.ops.object.modifier_apply which is context-fragile).
    Both a and b can be object names or object references."""
    A = get(a) if isinstance(a, str) else a
    B = get(b) if isinstance(b, str) else b
    if A.type != 'MESH' or B.type != 'MESH':
        raise ValueError("boolean_union needs two MESH objects (got %s, %s)" % (A.type, B.type))
    # Make sure single-user data
    if A.data.users > 1:
        A.data = A.data.copy()
    # Make sure object mode
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    # Clear selection, make A active
    try:
        for o in list(bpy.context.selected_objects):
            o.select_set(False)
    except Exception:
        pass
    A.hide_viewport = False
    A.hide_set(False)
    A.select_set(True)
    bpy.context.view_layer.objects.active = A
    B.hide_viewport = False
    B.hide_set(False)
    # Add modifier
    mod = A.modifiers.new('_union_' + B.name, 'BOOLEAN')
    mod.operation = 'UNION'
    mod.solver = solver
    mod.object = B
    # Force depsgraph update so modifier evaluates
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    eval_A = A.evaluated_get(dg)
    # Build new mesh from evaluated result (modifier applied)
    new_mesh = bpy.data.meshes.new_from_object(eval_A, preserve_all_data_layers=True, depsgraph=dg)
    new_mesh.name = A.name + '_mesh'
    old_mesh = A.data
    A.modifiers.remove(mod)
    A.data = new_mesh
    if old_mesh.users == 0:
        try:
            bpy.data.meshes.remove(old_mesh)
        except Exception:
            pass
    # Remove B
    if hide_b:
        try:
            bpy.data.objects.remove(B, do_unlink=True)
        except Exception:
            pass
    print('[boolean_union] merged %s into %s (V=%d F=%d)' % (
        B.name if not hide_b else B.name, A.name, len(new_mesh.vertices), len(new_mesh.polygons)))
    return A


def boolean_difference(a, b, solver='EXACT', hide_b=True):
    """Subtract b from a. Returns a."""
    A = get(a) if isinstance(a, str) else a
    B = get(b) if isinstance(b, str) else b
    if A.data.users > 1:
        A.data = A.data.copy()
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    A.hide_viewport = False; A.hide_set(False)
    B.hide_viewport = False; B.hide_set(False)
    mod = A.modifiers.new('_diff_' + B.name, 'BOOLEAN')
    mod.operation = 'DIFFERENCE'
    mod.solver = solver
    mod.object = B
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    eval_A = A.evaluated_get(dg)
    new_mesh = bpy.data.meshes.new_from_object(eval_A, preserve_all_data_layers=True, depsgraph=dg)
    old_mesh = A.data
    A.modifiers.remove(mod)
    A.data = new_mesh
    if old_mesh.users == 0:
        try: bpy.data.meshes.remove(old_mesh)
        except: pass
    if hide_b:
        try: bpy.data.objects.remove(B, do_unlink=True)
        except: pass
    return A


def boolean_intersect(a, b, solver='EXACT', hide_b=True):
    """Intersect a with b. Returns a."""
    A = get(a) if isinstance(a, str) else a
    B = get(b) if isinstance(b, str) else b
    if A.data.users > 1:
        A.data = A.data.copy()
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    A.hide_viewport = False; A.hide_set(False)
    B.hide_viewport = False; B.hide_set(False)
    mod = A.modifiers.new('_inter_' + B.name, 'BOOLEAN')
    mod.operation = 'INTERSECT'
    mod.solver = solver
    mod.object = B
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    eval_A = A.evaluated_get(dg)
    new_mesh = bpy.data.meshes.new_from_object(eval_A, preserve_all_data_layers=True, depsgraph=dg)
    old_mesh = A.data
    A.modifiers.remove(mod)
    A.data = new_mesh
    if old_mesh.users == 0:
        try: bpy.data.meshes.remove(old_mesh)
        except: pass
    if hide_b:
        try: bpy.data.objects.remove(B, do_unlink=True)
        except: pass
    return A
`;

omniLib = omniLib.trimEnd() + '\n' + booleanHelper;

// --- Add to __all__ ---
const oldAll = `'clear_scene','declare_spec','is_ground',
           'limb','subsurf','ellipsoid','skin_chain','torus_mesh']`;
const newAll = `'clear_scene','declare_spec','is_ground',
           'limb','subsurf','ellipsoid','skin_chain','torus_mesh',
           'boolean_union','boolean_difference','boolean_intersect']`;

if (!omniLib.includes(oldAll)) {
  console.error('❌ Could not find __all__ in omni_lib.py');
  process.exit(1);
}
omniLib = omniLib.replace(oldAll, newAll);

fs.writeFileSync(omniLibPath, omniLib, 'utf8');
console.log('✅ bridge/omni_lib.py — cyl() aliases + boolean helpers');

// ============================================================
// 2. Update system prompt in MainPanel.tsx
// ============================================================
const mainPath = path.join(process.cwd(), 'src', 'components', 'MainPanel.tsx');
let main = fs.readFileSync(mainPath, 'utf8');

// Find the omni_lib line in the prompt and expand it
const oldLibLine = `omni_lib: mat, box, cyl, sphere, torus, lathe, polyext, tube, ring, group, get, ground, set_world, studio_lights, frame_camera, render_setup, finish_scene, bbox, snap_to, center_on, dup, mirror_x, clear_scene, declare_spec, limb, subsurf, ellipsoid, skin_chain, torus_mesh.`;
const newLibLine = `omni_lib: mat, box, cyl, sphere, torus, lathe, polyext, tube, ring, group, get, ground, set_world, studio_lights, frame_camera, render_setup, finish_scene, bbox, snap_to, center_on, dup, mirror_x, clear_scene, declare_spec, limb, subsurf, ellipsoid, skin_chain, torus_mesh, boolean_union, boolean_difference, boolean_intersect.`;

if (!main.includes(oldLibLine)) {
  console.error('❌ Could not find omni_lib line in MainPanel.tsx');
  process.exit(1);
}
main = main.replace(oldLibLine, newLibLine);

// Add a rule about boolean usage right after the ABSOLUTE PROFESSIONAL RULES
const oldRuleEnd = `4. SKILL: Use omni_lib for the coarse base (box, cyl, lathe, sphere, limb, ellipsoid) and omni_edit for ALL precision details.`;
const newRuleEnd = `4. SKILL: Use omni_lib for the coarse base (box, cyl, lathe, sphere, limb, ellipsoid) and omni_edit for ALL precision details.
5. BOOLEAN RULE: To fuse two meshes into one (e.g., mug handle + body), use boolean_union('Body', 'Handle'). NEVER call bpy.ops.object.modifier_apply — it fails with "Modifier is disabled" in headless contexts. boolean_union / boolean_difference / boolean_intersect are robust helpers that handle this internally.
6. CYLINDER ARG NAMES: cyl() accepts verts / vertices / segments / sides / segs — pick any. Never pass any other keyword.`;

if (!main.includes(oldRuleEnd)) {
  console.error('❌ Could not find ABSOLUTE rules block in MainPanel.tsx');
  process.exit(1);
}
main = main.replace(oldRuleEnd, newRuleEnd);

fs.writeFileSync(mainPath, main, 'utf8');
console.log('✅ src/components/MainPanel.tsx — boolean rule added to prompt');

console.log('\n🎉 Patch v3 applied!');
console.log('\nNext:');
console.log('  Ctrl+C in terminal');
console.log('  npm run dev');
console.log('  Kill & Restart Blender');
console.log('  Send: "یک ماگ سرامیکی قهوه‌خوری بساز"');