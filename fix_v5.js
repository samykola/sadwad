const fs = require('fs');
const path = require('path');

// ============================================================
// PART 1: omni_lib.py — handle_attached + edge_bevel + add_studs
// ============================================================
const libPath = path.join(process.cwd(), 'bridge', 'omni_lib.py');
let lib = fs.readFileSync(libPath, 'utf8');

const libAddition = [
  '',
  '',
  '# ============ ATTACHMENT HELPERS (weld quality joins) ============',
  '',
  'def handle_attached(handle_name, body_ref, radius_curve=None, res=16, radial=10, mat=None, embed=0.006):',
  '    """C-shaped handle welded into body. Embed=meters to push tips into wall."""',
  '    if radius_curve is None:',
  '        radius_curve = [(0.0, 0.007), (0.5, 0.006), (1.0, 0.007)]',
  '    B = get(body_ref) if isinstance(body_ref, str) else body_ref',
  '    mn, mx = bbox(B)',
  '    cx, cy, cz = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2',
  '    outer_x = (mx.x - mn.x) / 2 + embed',
  '    z_top = mx.z - (mx.z - mn.z) * 0.25',
  '    z_bot = mn.z + (mx.z - mn.z) * 0.15',
  '    N = 24',
  '    pts = []',
  '    for i in range(N + 1):',
  '        t = i / N',
  '        a = math.pi * (t - 0.5)',
  '        x = cx + outer_x * math.cos(a)',
  '        z = cz + (z_top - z_bot) * 0.5 * math.sin(a)',
  '        pts.append((x, cy, z))',
  '    def r_at(u):',
  '        if u <= radius_curve[0][0]: return radius_curve[0][1]',
  '        if u >= radius_curve[-1][0]: return radius_curve[-1][1]',
  '        for i in range(len(radius_curve) - 1):',
  '            u0, r0 = radius_curve[i]',
  '            u1, r1 = radius_curve[i + 1]',
  '            if u0 <= u <= u1:',
  '                k = (u - u0) / (u1 - u0) if u1 > u0 else 0',
  '                return r0 + k * (r1 - r0)',
  '        return radius_curve[-1][1]',
  '    radii = [r_at(i / N) for i in range(N + 1)]',
  '    cu = bpy.data.curves.new(handle_name, "CURVE")',
  '    cu.dimensions = "3D"',
  '    cu.resolution_u = res',
  '    cu.bevel_depth = 1.0',
  '    cu.bevel_resolution = radial',
  '    cu.use_fill_caps = True',
  '    sp = cu.splines.new("BEZIER")',
  '    sp.bezier_points.add(len(pts) - 1)',
  '    for i, p in enumerate(pts):',
  '        bp = sp.bezier_points[i]',
  '        bp.co = p',
  '        bp.handle_left_type = "AUTO"',
  '        bp.handle_right_type = "AUTO"',
  '        bp.radius = radii[i]',
  '    hobj = bpy.data.objects.new(handle_name, cu)',
  '    bpy.context.scene.collection.objects.link(hobj)',
  '    if mat is not None:',
  '        cu.materials.append(mat)',
  '    try:',
  '        if bpy.context.object and bpy.context.object.mode != "OBJECT":',
  '            bpy.ops.object.mode_set(mode="OBJECT")',
  '    except Exception: pass',
  '    for o in list(bpy.context.selected_objects): o.select_set(False)',
  '    hobj.select_set(True)',
  '    bpy.context.view_layer.objects.active = hobj',
  '    bpy.ops.object.convert(target="MESH")',
  '    hobj = bpy.context.view_layer.objects.active',
  '    boolean_union(B, hobj)',
  '    print("[handle_attached] welded " + handle_name + " into " + B.name)',
  '    return B',
  '',
  '',
  'def edge_bevel(body_ref, sharp_angle=30, width=0.001, segments=2):',
  '    """Bevel all sharp edges on the body via omni_edit."""',
  '    try:',
  '        from omni_edit import edit',
  '    except Exception:',
  '        return',
  '    with edit(body_ref) as e:',
  '        es = e.edges(sharp=sharp_angle)',
  '        if len(es) > 0:',
  '            e.bevel(es, width, segments=segments)',
  '',
  '',
  'def add_studs(body_ref, positions, radius=0.002, height=0.0008, mat=None):',
  '    """Add N welded bumps at given world positions."""',
  '    B = get(body_ref) if isinstance(body_ref, str) else body_ref',
  '    studs = []',
  '    for i, p in enumerate(positions):',
  '        s = cyl(body_ref + "_stud_" + str(i), radius, height, p, mat=mat, segs=16)',
  '        studs.append(s)',
  '    for s in studs:',
  '        boolean_union(B, s)',
  '    return B'
].join('\n');

if (!lib.includes('def handle_attached')) {
  lib = lib.trimEnd() + '\n' + libAddition;
  if (!lib.includes("'handle_attached'")) {
    lib = lib.replace(
      "'boolean_union','boolean_difference','boolean_intersect']",
      "'boolean_union','boolean_difference','boolean_intersect','handle_attached','edge_bevel','add_studs']"
    );
  }
  fs.writeFileSync(libPath, lib, 'utf8');
  console.log('✅ omni_lib.py: handle_attached, edge_bevel, add_studs added');
} else {
  console.log('⚠️ handle_attached already exists — skipped');
}

// ============================================================
// PART 2: omni_edit.py — 13 power tools
// ============================================================
const editPath = path.join(process.cwd(), 'bridge', 'omni_edit.py');
let editContent = fs.readFileSync(editPath, 'utf8');

const powerTools = [
  '',
  '    # ───── POWER TRANSFORMS ─────',
  '    def bend(self, sel, angle_deg, axis="X", pivot=None):',
  '        self._need(sel, "VEF", "bend")',
  '        c = Vector(pivot) if pivot is not None else sel.center()',
  '        ax = _dir(axis)',
  '        up = Vector((0,0,1)) if abs(ax.z) < 0.9 else Vector((1,0,0))',
  '        u = (up - ax*up.dot(ax)).normalized()',
  '        v = ax.cross(u).normalized()',
  '        ang = math.radians(angle_deg)',
  '        def fn(p):',
  '            d = p - c',
  '            x = d.dot(u)',
  '            y = d.dot(v)',
  '            if abs(x) < 1e-9: return p',
  '            R = 1.0 / max(abs(x), 1e-6)',
  '            theta = x * ang',
  '            return c + u*(R*math.sin(theta)) + v*(y + R*(1-math.cos(theta))) + ax*d.dot(ax)',
  '        self._each(sel, fn)',
  '        return self._done("bend", sel, f"{angle_deg}deg")',
  '',
  '    def twist(self, sel, angle_deg, axis="Z", pivot=None):',
  '        self._need(sel, "VEF", "twist")',
  '        c = Vector(pivot) if pivot is not None else sel.center()',
  '        ax = _dir(axis)',
  '        lo = min((self.mw @ v.co).dot(ax) for v in sel.verts())',
  '        hi = max((self.mw @ v.co).dot(ax) for v in sel.verts())',
  '        span = max(hi - lo, 1e-6)',
  '        u = Vector((1,0,0)) if abs(ax.x) < 0.9 else Vector((0,1,0))',
  '        u = (u - ax*u.dot(ax)).normalized()',
  '        v = ax.cross(u).normalized()',
  '        def fn(p):',
  '            t = ((p - c).dot(ax) - lo) / span',
  '            a = math.radians(angle_deg) * t',
  '            d = p - c',
  '            d_ax = ax * d.dot(ax)',
  '            d_perp = d - d_ax',
  '            ca, sa = math.cos(a), math.sin(a)',
  '            np = u*(d_perp.dot(u)*ca - d_perp.dot(v)*sa) + v*(d_perp.dot(u)*sa + d_perp.dot(v)*ca)',
  '            return c + d_ax + np',
  '        self._each(sel, fn)',
  '        return self._done("twist", sel, f"{angle_deg}deg")',
  '',
  '    def taper(self, sel, factor_start=1.0, factor_end=0.5, axis="Z"):',
  '        self._need(sel, "VEF", "taper")',
  '        ax = _dir(axis)',
  '        lo = min((self.mw @ v.co).dot(ax) for v in sel.verts())',
  '        hi = max((self.mw @ v.co).dot(ax) for v in sel.verts())',
  '        span = max(hi - lo, 1e-6)',
  '        c = sel.center()',
  '        def fn(p):',
  '            t = ((p - c).dot(ax) - lo) / span',
  '            k = factor_start + (factor_end - factor_start) * t',
  '            d = p - c',
  '            d_ax = ax * d.dot(ax)',
  '            return c + d_ax + (d - d_ax) * k',
  '        self._each(sel, fn)',
  '        return self._done("taper", sel, f"{factor_start}..{factor_end}")',
  '',
  '    def shear(self, sel, axis="Z", factor=0.5, along="X"):',
  '        self._need(sel, "VEF", "shear")',
  '        ax = _dir(axis)',
  '        al = _dir(along)',
  '        c = sel.center()',
  '        lo = min((self.mw @ v.co).dot(ax) for v in sel.verts())',
  '        hi = max((self.mw @ v.co).dot(ax) for v in sel.verts())',
  '        span = max(hi - lo, 1e-6)',
  '        def fn(p):',
  '            t = ((p - c).dot(ax) - lo) / span',
  '            return p + al * (t * factor * span)',
  '        self._each(sel, fn)',
  '        return self._done("shear", sel, f"{factor}")',
  '',
  '    def align_to(self, sel, direction):',
  '        self._need(sel, "F", "align_to")',
  '        n = sel.normal()',
  '        target = _dir(direction)',
  '        if (n - target).length < 1e-4:',
  '            return self._done("align_to", sel, "noop")',
  '        axis = n.cross(target)',
  '        if axis.length < 1e-9: axis = Vector((1,0,0))',
  '        angle = math.degrees(n.angle(target))',
  '        return self.rotate(sel, axis.normalized(), angle)',
  '',
  '    def assign_material(self, sel, material):',
  '        self._need(sel, "F", "assign_material")',
  '        obj = self.obj',
  '        slot_idx = -1',
  '        for i, s in enumerate(obj.material_slots):',
  '            if s.material == material:',
  '                slot_idx = i; break',
  '        if slot_idx == -1:',
  '            obj.data.materials.append(material)',
  '            slot_idx = len(obj.data.materials) - 1',
  '        for f in sel.faces():',
  '            f.material_index = slot_idx',
  '        return self._done("assign_material", sel, material.name if material else "None")',
  '',
  '    def shade_smooth(self, sel=None):',
  '        for f in (sel.faces() if sel else self.bm.faces): f.smooth = True',
  '        return self._done("shade_smooth")',
  '',
  '    def shade_flat(self, sel=None):',
  '        for f in (sel.faces() if sel else self.bm.faces): f.smooth = False',
  '        return self._done("shade_flat")',
  '',
  '    def select_symmetry(self, axis="X"):',
  '        ax = _dir(axis)',
  '        return Sel(self, "F", [f for f in self.bm.faces if (self.mw @ f.calc_center_median()).dot(ax) > 0])',
  '',
  '    def delete_loose(self):',
  '        vs = [v for v in self.bm.verts if not v.link_edges]',
  '        if vs: bmesh.ops.delete(self.bm, geom=vs, context="VERTS")',
  '        return self._done("delete_loose", len(vs))',
  '',
  '    def weld_by_distance(self, sel=None, dist=0.0005):',
  '        return self.merge(sel, dist)',
  '',
  '    def apply_bevel_to_sharp(self, angle_deg=30, width=0.001, segments=2):',
  '        es = self.edges(sharp=angle_deg)',
  '        if len(es) > 0:',
  '            return self.bevel(es, width, segments=segments)',
  '        return self._done("apply_bevel_to_sharp", None, "0 edges")'
].join('\n');

if (!editContent.includes('def bend(self')) {
  editContent = editContent.replace(
    '    # ───── VIEW / DEBUG ─────',
    powerTools + '\n\n    # ───── VIEW / DEBUG ─────'
  );
  fs.writeFileSync(editPath, editContent, 'utf8');
  console.log('✅ omni_edit.py: 13 power tools added');
} else {
  console.log('⚠️ power tools already exist');
}

// ============================================================
// PART 3: MainPanel.tsx — prompt with handle rule + power tools
// ============================================================
const mainPath = path.join(process.cwd(), 'src', 'components', 'MainPanel.tsx');
let main = fs.readFileSync(mainPath, 'utf8');

// 3a. Handle rule
const ruleMarker = '--- ABSOLUTE PROFESSIONAL RULES (DO NOT BREAK) ---';
if (!main.includes('0. HANDLE / ATTACHMENT RULE')) {
  main = main.replace(
    ruleMarker,
    ruleMarker + '\n0. HANDLE / ATTACHMENT RULE: For ANY object with a handle (mug, teapot, kettle, hammer, basket), use handle_attached(\"Handle\", \"Body\", radius_curve=[(0.0, 0.007), (0.5, 0.006), (1.0, 0.007)], embed=0.006). This creates a C-shaped handle AND welds it in ONE call. Do NOT place a torus or tube near the body — it will leave a gap. The handle MUST merge with the wall via boolean.'
  );
  console.log('✅ Handle rule added to prompt');
}

// 3b. Power tools documentation
const powerMarker = 'Selection helpers:\n- sel.center(), sel.normal(), sel.bbox(), sel.grow(), len(sel)';
if (!main.includes('POWER TRANSFORMS (in addition')) {
  const powerDoc = [
    powerMarker,
    '',
    'POWER TRANSFORMS (in addition to move/scale/rotate):',
    '- e.bend(sel, angle_deg, axis="X")      — smooth bend (handles, hooks, arms)',
    '- e.twist(sel, angle_deg, axis="Z")     — twist along axis',
    '- e.taper(sel, factor_start=1.0, factor_end=0.5, axis="Z")  — conical taper',
    '- e.shear(sel, axis="Z", factor=0.5, along="X")  — shear/skew',
    '- e.align_to(sel, "+Z")                 — rotate faces so normal points direction',
    '- e.assign_material(sel, mat)           — apply material to faces',
    '- e.shade_smooth(sel), e.shade_flat(sel) — per-face shading',
    '- e.select_symmetry("X")                — faces on +side',
    '- e.apply_bevel_to_sharp(angle_deg=30, width=0.001)  — auto bevel sharp edges',
    '- e.weld_by_distance(dist=0.0005)       — merge duplicates',
    '- e.delete_loose()                      — remove stray verts',
    '',
    'ATTACHMENT HELPERS (omni_lib):',
    '- handle_attached(name, body, radius_curve, embed=0.006)  — C-handle welded',
    '- edge_bevel(body, sharp_angle=30, width=0.001)           — one-call bevel',
    '- add_studs(body, [(x,y,z), ...], radius, height)         — N welded bumps'
  ].join('\n');
  main = main.replace(powerMarker, powerDoc);
  console.log('✅ Power tools documentation added');
}

// 3c. Golden handle example
const goldMarker = "print(edit_report('Dice'))";
if (!main.includes('GOLDEN EXAMPLE 2: Mug')) {
  const goldExample = [
    goldMarker,
    '',
    '--- GOLDEN EXAMPLE 2: Mug with welded handle ---',
    'ceramic = mat("Ceramic", (0.95,0.95,0.95), rough=0.2)',
    'coffee = mat("Coffee", (0.10,0.05,0.02), rough=0.1)',
    'cyl("Mug_Body", 0.04, 0.09, (0,0,0.045), ceramic)',
    'with edit("Mug_Body") as e:',
    '    top = e.faces(normal="+Z")',
    '    inner = e.inset(top, 0.004)',
    '    e.extrude(inner, -0.086)',
    '    e.apply_bevel_to_sharp(angle_deg=40, width=0.0008, segments=2)',
    'print(edit_report("Mug_Body"))',
    'handle_attached("Handle", "Mug_Body", radius_curve=[(0.0, 0.007), (0.5, 0.006), (1.0, 0.007)], embed=0.008)',
    'cyl("Coffee", 0.0355, 0.045, (0,0,0.0275), coffee)',
    'print(edit_report("Mug_Body"))'
  ].join('\n');
  main = main.replace(goldMarker, goldExample);
  console.log('✅ Golden handle example added');
}

fs.writeFileSync(mainPath, main, 'utf8');

console.log('\n🎉 fix_v5 applied!');
console.log('\nNext:');
console.log('  1) Ctrl+C in terminal');
console.log('  2) npm run dev');
console.log('  3) Kill & Restart Blender');
console.log('  4) Send: "یک ماگ سرامیکی قهوه‌خوری بساز"');