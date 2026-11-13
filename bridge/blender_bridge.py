import bpy, bmesh, socket, threading, json, queue, traceback, time, sys, os, io, contextlib, string, re, math, random, types
from mathutils import Vector

PORT = int(os.environ.get('OMNIBLEND_PORT', 9876))

try:
    _HERE = os.path.dirname(os.path.abspath(__file__))
except NameError:
    _HERE = os.path.join(os.getcwd(), 'bridge')
sys.path.insert(0, _HERE)
try:
    import omni_lib
except Exception:
    omni_lib = None
    traceback.print_exc()
try:
    import omni_edit
except Exception:
    omni_edit = None
    traceback.print_exc()

q = queue.Queue()

GEO_TYPES = {'MESH', 'CURVE', 'SURFACE', 'FONT', 'META'}
SYMS = string.ascii_uppercase + string.ascii_lowercase + string.digits
DEFAULT_NAME = re.compile(r'^(Cube|Sphere|UV Sphere|Cylinder|Plane|Cone|Torus|Circle|Icosphere|Monkey)(\.\d+)?$')

VIEWS = [
    ('FRONT (viewer looks +Y; right=+X, up=+Z):', (0, 1, 0), (0, 0, 1)),
    ('SIDE (viewer looks +X; right=-Y, up=+Z):', (1, 0, 0), (0, 0, 1)),
    ('TOP (viewer looks down; right=+X, up=+Y):', (0, 0, -1), (0, 1, 0)),
    ('ISO 3/4 (from front-left-above):', (0.55, 0.7, -0.45), (0, 0, 1)),
]


def make_ns():
    ns = {'bpy': bpy, 'bmesh': bmesh, 'math': math, 'random': random,
          'Vector': Vector, 'json': json, '__name__': '__omniblend__'}

    # Inject missing base imports into both libraries (defensive)
    for _mod in (omni_lib, omni_edit):
        if _mod is None:
            continue
        for _name, _obj in [('bpy', bpy), ('bmesh', bmesh), ('math', math),
                            ('random', random), ('Vector', Vector), ('json', json),
                            ('os', os), ('sys', sys), ('types', types)]:
            try:
                if getattr(_mod, _name, None) is None:
                    setattr(_mod, _name, _obj)
                    print('[bridge] injected import into', _mod.__name__, ':', _name, flush=True)
            except Exception:
                pass

    # Expose both libraries
    for _mod in (omni_lib, omni_edit):
        if _mod is None:
            print('[bridge] WARNING: module not imported:', _mod, flush=True)
            continue
        names = getattr(_mod, '__all__', None)
        if names is None:
            names = [k for k, v in vars(_mod).items()
                     if not k.startswith('_') and not isinstance(v, types.ModuleType)]
        for k in names:
            if hasattr(_mod, k):
                ns[k] = getattr(_mod, k)
            else:
                print('[bridge] missing name in', _mod.__name__, ':', k, flush=True)

    return ns


def find_view3d_override():
    try:
        for w in bpy.context.window_manager.windows:
            for a in w.screen.areas:
                if a.type == 'VIEW_3D':
                    for r in a.regions:
                        if r.type == 'WINDOW':
                            return {'window': w, 'area': a, 'region': r}
    except Exception:
        pass
    return None


def ensure_context():
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass
    try:
        if bpy.context.scene and len(bpy.context.scene.objects) > 0:
            if not bpy.context.view_layer.objects.active:
                bpy.context.view_layer.objects.active = bpy.context.scene.objects[0]
                bpy.context.scene.objects[0].select_set(True)
    except Exception:
        pass


# ---------------------------------------------------------------- inspection
def r3(v):
    return [round(float(x), 3) for x in v]


def is_ground(o):
    return o.name.startswith('Ground')


def world_bbox(o, dg):
    try:
        eo = o.evaluated_get(dg)
        pts = [o.matrix_world @ Vector(c) for c in eo.bound_box]
        mn = [min(p[i] for p in pts) for i in range(3)]
        mx = [max(p[i] for p in pts) for i in range(3)]
        return mn, mx
    except Exception:
        return None


def mesh_stats(o, dg):
    try:
        eo = o.evaluated_get(dg)
        me = eo.to_mesh()
        st = {'verts': len(me.vertices), 'faces': len(me.polygons), 'open_edges': 0, 'loose': 0}
        if len(me.vertices) <= 50000:
            bm = bmesh.new()
            bm.from_mesh(me)
            st['open_edges'] = sum(1 for e in bm.edges if not e.is_manifold)
            st['loose'] = sum(1 for v in bm.verts if not v.link_edges)
            bm.free()
        eo.to_mesh_clear()
        return st
    except Exception:
        return None


def overlap_dims(a, b):
    d = [min(a[1][i], b[1][i]) - max(a[0][i], b[0][i]) for i in range(3)]
    return d if all(x > 0.001 for x in d) else None


def ray_view(s, dg, name2sym, bounds, d, up, W=64, H=30):
    mn, mx = bounds
    pad = (mx - mn).length * 0.02 + 1e-4
    mn = mn - Vector((pad, pad, pad))
    mx = mx + Vector((pad, pad, pad))
    c = (mn + mx) / 2
    d = Vector(d).normalized()
    up = Vector(up)
    up = (up - d * up.dot(d)).normalized()
    r = d.cross(up).normalized()
    corners = [Vector((x, y, z)) for x in (mn.x, mx.x) for y in (mn.y, mx.y) for z in (mn.z, mx.z)]
    rs = [(p - c).dot(r) for p in corners]
    us = [(p - c).dot(up) for p in corners]
    r0, r1, u0, u1 = min(rs), max(rs), min(us), max(us)
    hw = max(r1 - r0, 1e-6)
    hu = max(u1 - u0, 1e-6)
    cell = max(hw / W, hu / (H * 2.0))
    cols = max(1, min(W + 1, int(hw / cell) + 1))
    rows = max(1, min(H + 1, int(hu / (cell * 2.0)) + 1))
    back = (mx - mn).length * 2 + 1.0
    lines = []
    for j in range(rows):
        uu = u1 - (j + 0.5) * cell * 2.0
        row = []
        for i in range(cols):
            rr = r0 + (i + 0.5) * cell
            origin = c + r * rr + up * uu - d * back
            ok, loc, nor, idx, ob, mt = s.ray_cast(dg, origin, d)
            if not ok or ob is None:
                row.append('.')
            else:
                nm = ob.original.name if hasattr(ob, 'original') else ob.name
                row.append('_' if nm.startswith('Ground') else name2sym.get(nm, '*'))
        lines.append(''.join(row))
    lines.append('(cell = %.1f mm wide, %.1f mm tall; "." empty, "_" ground)' % (cell * 1000, cell * 2000))
    return lines


def quality_info(items):
    geo = [i['o'] for i in items]
    raw = [o.name for o in geo if o.type == 'MESH' and len(o.data.vertices) <= 8 and not o.modifiers]
    bev = [o for o in geo if any(m.type == 'BEVEL' for m in o.modifiers)]
    mats = set()
    faces = 0
    for o in geo:
        for sl in o.material_slots:
            if sl.material:
                mats.add(sl.material.name)
        if o.type == 'MESH':
            faces += len(o.data.polygons)
    line = 'QUALITY: parts=%d unique_materials=%d base_faces=%d raw_primitives=%d bevelled=%d/%d' % (
        len(geo), len(mats), faces, len(raw), len(bev), len(geo))
    iss = []
    if geo and len(raw) / len(geo) > 0.5:
        iss.append('LOW_QUALITY: %d of %d parts are raw unbevelled cubes/primitives: %s' % (len(raw), len(geo), raw[:8]))
    if len(mats) < 3 and len(geo) > 5:
        iss.append('LOW_QUALITY: only %d unique materials, use more variety' % len(mats))
    return line, iss


def spec_check(s, items):
    raw = s.get('omni_spec')
    if not raw:
        return [], ['NO_SPEC: declare_spec() was never called, proportions cannot be verified']
    try:
        sp = json.loads(raw)
    except Exception:
        return [], []
    lines, iss = [], []
    if items:
        mn = [min(i['bb'][0][k] for i in items) for k in range(3)]
        mx = [max(i['bb'][1][k] for i in items) for k in range(3)]
        act = [mx[k] - mn[k] for k in range(3)]
        tgt = sp.get('overall')
        if tgt and len(tgt) == 3:
            lines.append('SPEC overall (W,D,H) target=%s actual=%s' % (r3(tgt), r3(act)))
            if tgt[2] > 0:
                dz = (act[2] - tgt[2]) / tgt[2] * 100
                if abs(dz) > 15:
                    iss.append('SPEC_MISMATCH height: target %.3f actual %.3f (%+.0f%%)' % (tgt[2], act[2], dz))
            ts, as_ = sorted(tgt[:2]), sorted(act[:2])
            for k, nm in enumerate(('footprint short side', 'footprint long side')):
                if ts[k] > 0:
                    dv = (as_[k] - ts[k]) / ts[k] * 100
                    if abs(dv) > 20:
                        iss.append('SPEC_MISMATCH %s: target %.3f actual %.3f (%+.0f%%)' % (nm, ts[k], as_[k], dv))
    for key, dims in (sp.get('parts') or {}).items():
        found = [i['o'] for i in items if i['o'].name == key or i['o'].name.startswith(key)]
        if not found:
            iss.append('SPEC_MISSING_PART: %s (declared but not built)' % key)
            continue
        o = found[0]
        a, t = sorted(o.dimensions), sorted(dims)
        if any(t[k] > 0 and abs(a[k] - t[k]) / t[k] > 0.3 for k in range(3)):
            iss.append('SPEC_PART_MISMATCH: %s target dims %s actual %s' % (o.name, r3(t), r3(a)))
    return lines, iss


def build_report(s):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    objs = list(s.objects)
    items, rows, issues = [], [], []
    n_light = n_cam = 0
    name2sym = {}

    for idx, o in enumerate(objs):
        sym = SYMS[idx] if idx < len(SYMS) else '*'
        name2sym[o.name] = sym
        if o.type == 'LIGHT': n_light += 1
        if o.type == 'CAMERA': n_cam += 1
        gnd = is_ground(o)
        is_geo = o.type in GEO_TYPES
        bb = world_bbox(o, dg) if is_geo else None
        mats = [sl.material.name for sl in o.material_slots if sl.material] if is_geo else []
        st = mesh_stats(o, dg) if o.type == 'MESH' else None
        mods = [m.type for m in o.modifiers] if hasattr(o, 'modifiers') else []
        hidden = False
        try:
            hidden = o.hide_get() or o.hide_viewport
        except Exception:
            pass

        row = '%s | %s | %s | loc=%s | dim=%s' % (sym, o.name, o.type, r3(o.location), r3(o.dimensions))
        if bb:
            row += ' | z=[%.3f..%.3f]' % (bb[0][2], bb[1][2])
        if is_geo:
            row += ' | mats=%s' % (mats if mats else 'NONE')
        if st:
            row += ' | v=%d f=%d' % (st['verts'], st['faces'])
        if mods: row += ' | mods=%s' % mods
        if o.parent: row += ' | parent=%s' % o.parent.name
        if hidden: row += ' | HIDDEN'
        rows.append(row)

        if is_geo and not gnd:
            if not mats: issues.append('NO_MATERIAL: %s' % o.name)
            if min(o.scale) < 0: issues.append('NEGATIVE_SCALE: %s scale=%s' % (o.name, r3(o.scale)))
            if DEFAULT_NAME.match(o.name): issues.append('DEFAULT_NAME: %s (give it a meaningful name)' % o.name)
            if st and st['faces'] == 0 and o.type == 'MESH': issues.append('EMPTY_MESH (no faces): %s' % o.name)
            if st and st['loose'] > 0: issues.append('LOOSE_VERTS: %s has %d' % (o.name, st['loose']))
            if hidden: issues.append('HIDDEN: %s' % o.name)
            if bb:
                sz = [bb[1][i] - bb[0][i] for i in range(3)]
                if min(sz) < 0.001 and st and st['faces'] > 0:
                    issues.append('FLAT_OR_ZERO_THICKNESS: %s size=%s' % (o.name, r3(sz)))
                if bb[1][2] < -0.01:
                    issues.append('BELOW_GROUND: %s top z=%.3f' % (o.name, bb[1][2]))
                items.append({'o': o, 'bb': bb, 'sym': sym})

    for it in items:
        a, b = it['bb']
        if a[2] <= 0.02:
            continue
        supported = False
        for ot in items:
            if ot is it: continue
            c, d = ot['bb']
            xy = min(b[0], d[0]) - max(a[0], c[0]) > 0 and min(b[1], d[1]) - max(a[1], c[1]) > 0
            if xy and d[2] >= a[2] - 0.02 and c[2] < b[2]:
                supported = True; break
        if not supported and not it['o'].parent:
            issues.append('FLOATING: %s bottom z=%.3f (nothing under it, use snap_to to attach it)' % (it['o'].name, a[2]))

    pens = []
    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            A, B = items[i], items[j]
            if A['o'].parent is B['o'] or B['o'].parent is A['o']:
                continue
            d = overlap_dims(A['bb'], B['bb'])
            if d and min(d) > 0.02:
                pens.append((min(d), A['o'].name, B['o'].name, d))
    pens.sort(reverse=True)
    for depth, na, nb, d in pens[:12]:
        issues.append('BBOX_OVERLAP: %s <-> %s depth~%.3fm (may be fine if joined on purpose)' % (na, nb, depth))

    if n_cam == 0: issues.append('INFO: no camera in scene')
    if n_light == 0: issues.append('INFO: no light in scene')

    q_line, q_iss = quality_info(items)
    spec_lines, spec_iss = spec_check(s, items)
    issues = spec_iss + q_iss + issues

    # --- EDIT_REPORT for precision-edited meshes ---
    edit_lines = []
    if omni_edit:
        for it in items:
            try:
                rep = omni_edit.edit_report(it['o'])
                if rep and ('EDIT_ISSUES: none' not in rep):
                    edit_lines.append(rep)
            except Exception as e:
                print('[bridge] edit_report failed for', it['o'].name, ':', e, flush=True)

    out = []
    out.append('SCENE: %s | engine=%s | objects=%d (geometry=%d, lights=%d, cameras=%d)' % (
        s.name, s.render.engine, len(objs), len(items), n_light, n_cam))
    mn = mx = None
    if items:
        mn = Vector([min(i['bb'][0][k] for i in items) for k in range(3)])
        mx = Vector([max(i['bb'][1][k] for i in items) for k in range(3)])
        out.append('BOUNDS (without ground): min=%s max=%s size=%s' % (r3(mn), r3(mx), r3(mx - mn)))
        out.append(q_line)
    out.extend(spec_lines)
    out.append('')
    out.append('ISSUES (%d):' % len(issues))
    out.extend(issues[:40] if issues else ['none'])
    out.append('')

    if edit_lines:
        out.append('EDIT REPORTS (topology audit):')
        out.extend(edit_lines[:20])
        out.append('')

    if items:
        for title, d, up in VIEWS:
            out.append(title)
            try:
                out.extend(ray_view(s, dg, name2sym, (mn, mx), d, up))
            except Exception:
                out.append('VIEW_ERROR: ' + traceback.format_exc().splitlines()[-1])
            out.append('')
        out.append('LEGEND: ' + ', '.join('%s=%s' % (it['sym'], it['o'].name) for it in items[:50]))
        out.append('')

    out.append('OBJECTS (sym | name | type | location | dimensions ...):')
    out.extend(rows[:45])
    if len(rows) > 45: out.append('... and %d more objects' % (len(rows) - 45))
    return '\n'.join(out)


def take_snapshot():
    s = bpy.context.scene
    base = {'scene': {'name': s.name, 'objects': [{'name': o.name, 'type': o.type, 'location': list(o.location), 'dimensions': list(o.dimensions), 'materials': [m.name for m in (o.data.materials if hasattr(o.data, 'materials') else []) if m]} for o in s.objects], 'render': {'engine': s.render.engine}}}
    try:
        base['report'] = build_report(s)
    except Exception:
        base['report'] = 'REPORT_ERROR\n' + traceback.format_exc()
    return base


# ---------------------------------------------------------------- exec
def run_code(code):
    buf = io.StringIO()
    try:
        ns = make_ns()
        with contextlib.redirect_stdout(buf), contextlib.redirect_stderr(buf):
            ov = find_view3d_override()
            if ov and hasattr(bpy.context, 'temp_override'):
                with bpy.context.temp_override(**ov):
                    exec(code, ns)
            else:
                exec(code, ns)
        return {'ok': True, 'output': buf.getvalue()}
    except BaseException:
        return {'ok': False, 'error': traceback.format_exc(), 'output': buf.getvalue()}


def handle(msg):
    op = msg.get('op')
    if op == 'ping':
        return {'ok': True, 'version': bpy.app.version_string}
    if op == 'exec':
        ensure_context()
        return run_code(msg.get('code', ''))
    if op == 'snapshot':
        return {'ok': True, 'snapshot': take_snapshot()}
    return {'ok': False, 'error': 'unknown op'}


def process_queue():
    try:
        while True:
            try:
                msg, conn = q.get_nowait()
            except queue.Empty:
                break
            try:
                result = handle(msg)
            except BaseException:
                result = {'ok': False, 'error': traceback.format_exc()}
            try:
                conn.sendall((json.dumps({'id': msg.get('id'), 'result': result}) + '\n').encode())
            except Exception as e:
                print('Send error:', e, flush=True)
    except BaseException:
        traceback.print_exc()
    return 0.01


def client_loop(conn):
    buf = b''
    try:
        while True:
            data = conn.recv(65536)
            if not data: break
            buf += data
            while b'\n' in buf:
                line, buf = buf.split(b'\n', 1)
                try: msg = json.loads(line.decode())
                except Exception: continue
                q.put((msg, conn))
    except Exception: pass
    finally:
        try: conn.close()
        except Exception: pass


def accept_loop(srv):
    while True:
        try:
            conn, _ = srv.accept()
        except OSError: break
        threading.Thread(target=client_loop, args=(conn,), daemon=True).start()


srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
try:
    srv.bind(('127.0.0.1', PORT))
except OSError:
    print(f'Port {PORT} in use.', flush=True)
    sys.exit(1)
srv.listen(4)
threading.Thread(target=accept_loop, args=(srv,), daemon=True).start()
print('[bridge] listening on', PORT, flush=True)

if bpy.app.background:
    try:
        while True:
            process_queue()
            time.sleep(0.01)
    except KeyboardInterrupt:
        pass
    finally:
        try: srv.close()
        except Exception: pass
else:
    bpy.app.timers.register(process_queue, first_interval=0.05, persistent=True)