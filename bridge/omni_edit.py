"""
omni_edit.py — Precision Edit-Mode toolkit for OmniBlend
========================================================
Transactional, bmesh-based mesh editing. Same engine as Blender's Edit Mode,
but deterministic (no bpy.ops.mesh.*, no context/selection fragility).

    from omni_edit import edit, edit_report
    with edit("Lid") as e:
        top = e.faces(normal='+Z', box=((None,None,0.03),(None,None,None)))
        rim = e.inset(top, 0.002)
        e.extrude(rim, -0.001)
        e.bevel(e.edges(sharp=30), 0.0005, segments=2)
    print(edit_report("Lid"))
"""
import math
import bpy
import bmesh
from mathutils import Vector, Matrix, kdtree

__all__ = ["edit", "edit_report", "edit_report_all", "EditError", "Sel"]

_AX = {'X': 0, 'Y': 1, 'Z': 2}
_BV, _BE, _BF = bmesh.types.BMVert, bmesh.types.BMEdge, bmesh.types.BMFace


class EditError(Exception):
    pass


def _dir(d):
    if isinstance(d, str):
        s = d.strip().upper()
        sign = -1.0 if s.startswith('-') else 1.0
        ax = s.lstrip('+-')
        if ax not in _AX:
            raise EditError(f"bad direction '{d}'")
        v = Vector((0, 0, 0)); v[_AX[ax]] = sign
        return v
    v = Vector(d)
    if v.length < 1e-9:
        raise EditError("zero-length direction")
    return v.normalized()


def _axis_idx(a):
    a = str(a).strip().upper().lstrip('+-')
    if a not in _AX:
        raise EditError(f"bad axis '{a}'")
    return _AX[a]


def _in_box(p, box):
    lo, hi = box
    for i in range(3):
        if lo[i] is not None and p[i] < lo[i]: return False
        if hi[i] is not None and p[i] > hi[i]: return False
    return True


class Sel:
    __slots__ = ("ed", "kind", "items")
    def __init__(self, ed, kind, items):
        self.ed, self.kind = ed, kind
        self.items = [i for i in dict.fromkeys(items) if i.is_valid]
    def __len__(self): return len(self.items)
    def __iter__(self): return iter(self.items)
    def __bool__(self): return bool(self.items)
    def __repr__(self): return f"<Sel {self.kind}:{len(self.items)}>"
    def __add__(self, o):
        if o.kind != self.kind:
            raise EditError(f"cannot add {self.kind} + {o.kind}")
        return Sel(self.ed, self.kind, self.items + o.items)
    def verts(self):
        if self.kind == 'V': return list(self.items)
        return list(dict.fromkeys(v for i in self.items for v in i.verts))
    def edges(self):
        if self.kind == 'E': return list(self.items)
        if self.kind == 'F': return list(dict.fromkeys(e for f in self.items for e in f.edges))
        vs = set(self.items)
        return [e for e in self.ed.bm.edges if e.verts[0] in vs and e.verts[1] in vs]
    def faces(self):
        if self.kind == 'F': return list(self.items)
        vs = set(self.verts())
        return [f for f in self.ed.bm.faces if all(v in vs for v in f.verts)]
    def center(self):
        vs = self.verts()
        if not vs: raise EditError("empty selection")
        return self.ed.mw @ (sum((v.co for v in vs), Vector()) / len(vs))
    def normal(self):
        if self.kind != 'F': raise EditError("normal() needs faces")
        n = sum((f.normal * f.calc_area() for f in self.items), Vector())
        if n.length < 1e-9 and self.items: n = self.items[0].normal
        return (self.ed.r3 @ n).normalized()
    def bbox(self):
        ps = [self.ed.mw @ v.co for v in self.verts()]
        if not ps: raise EditError("empty selection")
        return (Vector(min(p[i] for p in ps) for i in range(3)),
                Vector(max(p[i] for p in ps) for i in range(3)))
    def filter(self, fn): return Sel(self.ed, self.kind, [i for i in self.items if fn(i)])
    def grow(self):
        if self.kind == 'F':
            vs = set(self.verts())
            return Sel(self.ed, 'F', [f for f in self.ed.bm.faces if any(v in vs for v in f.verts)])
        if self.kind == 'E':
            vs = set(self.verts())
            return Sel(self.ed, 'E', [e for e in self.ed.bm.edges if e.verts[0] in vs or e.verts[1] in vs])
        return Sel(self.ed, 'V', [o for v in self.items for e in v.link_edges for o in (e.other_vert(v),)] + self.items)
    def info(self):
        if not self.items: return f"{self.kind}:0"
        lo, hi = self.bbox()
        f = lambda v: "(%.4f,%.4f,%.4f)" % tuple(v)
        return f"{self.kind}:{len(self.items)} bbox={f(lo)}..{f(hi)}"


class Editor:
    def __init__(self, obj, bm):
        self.obj, self.bm = obj, bm
        self.mw = obj.matrix_world.copy()
        self.mwi = self.mw.inverted()
        self.r3 = self.mw.to_3x3()
        self.r3i = self.r3.inverted()
        self.log = []
    def _fix(self):
        for t in (self.bm.verts, self.bm.edges, self.bm.faces):
            t.ensure_lookup_table(); t.index_update()
    def _lp(self, p): return self.mwi @ Vector(p)
    def _ld(self, d): return self.r3i @ Vector(d)
    def _done(self, name, result=None, note=""):
        self._fix()
        for v in self.bm.verts:
            c = v.co
            if c.x != c.x or c.y != c.y or c.z != c.z or max(abs(c.x), abs(c.y), abs(c.z)) > 1e5:
                raise EditError(f"{name}: invalid vertex -> rolled back")
        self.log.append(f"{name} {note} -> {result if result is not None else 'ok'}")
        return result
    def _need(self, sel, kinds, name):
        if sel is None or len(sel) == 0:
            raise EditError(f"{name}: empty selection")
        if sel.kind not in kinds:
            raise EditError(f"{name}: needs {'/'.join(kinds)}, got {sel.kind}")
    def faces(self, normal=None, angle=20, box=None, sphere=None, where=None,
              min_area=None, max_area=None, sides=None, within=None):
        n = _dir(normal) if normal is not None else None
        cs = math.cos(math.radians(angle))
        out = []
        for f in (within.faces() if within else self.bm.faces):
            if n is not None and (self.r3 @ f.normal).normalized().dot(n) < cs: continue
            c = self.mw @ f.calc_center_median()
            if box and not _in_box(c, box): continue
            if sphere and (c - Vector(sphere[0])).length > sphere[1]: continue
            a = f.calc_area()
            if min_area is not None and a < min_area: continue
            if max_area is not None and a > max_area: continue
            if sides and len(f.verts) != sides: continue
            if where and not where(f): continue
            out.append(f)
        return Sel(self, 'F', out)
    def edges(self, sharp=None, boundary=False, nonmanifold=False, parallel=None,
              box=None, where=None, min_len=None, max_len=None, within=None):
        par = _dir(parallel) if parallel is not None else None
        out = []
        for ed in (within.edges() if within else self.bm.edges):
            if boundary and not ed.is_boundary: continue
            if nonmanifold and len(ed.link_faces) <= 2 and not ed.is_wire: continue
            if sharp is not None:
                if len(ed.link_faces) != 2 or math.degrees(ed.calc_face_angle(0.0)) < sharp: continue
            ln = ed.calc_length()
            if min_len is not None and ln < min_len: continue
            if max_len is not None and ln > max_len: continue
            if par is not None:
                d = (self.r3 @ (ed.verts[1].co - ed.verts[0].co)).normalized()
                if abs(d.dot(par)) < 0.996: continue
            if box and not _in_box(self.mw @ ((ed.verts[0].co + ed.verts[1].co) / 2), box): continue
            if where and not where(ed): continue
            out.append(ed)
        return Sel(self, 'E', out)
    def verts(self, box=None, sphere=None, where=None, within=None):
        out = []
        for v in (within.verts() if within else self.bm.verts):
            p = self.mw @ v.co
            if box and not _in_box(p, box): continue
            if sphere and (p - Vector(sphere[0])).length > sphere[1]: continue
            if where and not where(v): continue
            out.append(v)
        return Sel(self, 'V', out)
    def boundary(self, sel):
        self._need(sel, 'F', "boundary")
        fs = set(sel.items)
        return Sel(self, 'E', [e for e in sel.edges() if sum(1 for f in e.link_faces if f in fs) == 1])
    def loop_at(self, axis, pos, tol=1e-4):
        i = _axis_idx(axis)
        return self.edges(where=lambda ed: all(abs((self.mw @ v.co)[i] - pos) < tol for v in ed.verts))
    def loop_cut(self, axis, pos, tol=1e-5):
        i = _axis_idx(axis)
        co = Vector((0, 0, 0)); co[i] = pos
        no = Vector((0, 0, 0)); no[i] = 1
        geom = list(self.bm.verts) + list(self.bm.edges) + list(self.bm.faces)
        r = bmesh.ops.bisect_plane(self.bm, geom=geom, plane_co=self._lp(co),
                                   plane_no=self._ld(no).normalized(), dist=tol)
        cut = [g for g in r['geom_cut'] if isinstance(g, _BE)]
        if not cut: raise EditError(f"loop_cut {axis}={pos}: no intersection")
        return self._done("loop_cut", Sel(self, 'E', cut), f"{axis}={pos}")
    def loop_cuts(self, axis, positions):
        res = Sel(self, 'E', [])
        for p in positions: res = res + self.loop_cut(axis, p)
        return res
    def subdivide(self, sel, cuts=1):
        self._need(sel, 'EF', "subdivide")
        bmesh.ops.subdivide_edges(self.bm, edges=sel.edges(), cuts=cuts, use_grid_fill=True)
        return self._done("subdivide", None, f"cuts={cuts}")
    def extrude(self, sel, dist, direction=None, individual=False):
        self._need(sel, 'F', "extrude")
        fs = sel.faces()
        if individual:
            new = bmesh.ops.extrude_discrete_faces(self.bm, faces=fs)['faces']
            for f in new: bmesh.ops.translate(self.bm, vec=f.normal * dist, verts=list(f.verts))
        else:
            n = _dir(direction) if direction is not None else sel.normal()
            g = bmesh.ops.extrude_face_region(self.bm, geom=fs)['geom']
            vs = [x for x in g if isinstance(x, _BV)]
            new = [x for x in g if isinstance(x, _BF)]
            bmesh.ops.translate(self.bm, vec=self._ld(n * dist), verts=vs)
        return self._done("extrude", Sel(self, 'F', new), f"d={dist}")
    def inset(self, sel, thickness, depth=0.0, individual=False):
        self._need(sel, 'F', "inset")
        fs = sel.faces()
        if individual:
            r = bmesh.ops.inset_individual(self.bm, faces=fs, thickness=thickness, depth=depth, use_even_offset=True)
        else:
            r = bmesh.ops.inset_region(self.bm, faces=fs, thickness=thickness, depth=depth,
                                       use_even_offset=True, use_boundary=True)
        self.last_rim = Sel(self, 'F', r['faces'])
        return self._done("inset", Sel(self, 'F', fs), f"t={thickness} depth={depth}")
    def bevel(self, sel, width, segments=2, profile=0.5):
        self._need(sel, 'EF', "bevel")
        r = bmesh.ops.bevel(self.bm, geom=sel.edges(), offset=width, offset_type='OFFSET',
                            segments=segments, profile=profile, affect='EDGES',
                            clamp_overlap=True, loop_slide=True)
        return self._done("bevel", Sel(self, 'F', r['faces']), f"w={width} seg={segments}")
    def bridge(self, sel):
        self._need(sel, 'E', "bridge")
        r = bmesh.ops.bridge_loops(self.bm, edges=sel.edges(), use_merge=False)
        return self._done("bridge", Sel(self, 'F', r['faces']))
    def fill(self, sel):
        self._need(sel, 'E', "fill")
        r = bmesh.ops.holes_fill(self.bm, edges=sel.edges(), sides=0)
        return self._done("fill", Sel(self, 'F', r['faces']))
    def dissolve(self, sel):
        self._need(sel, 'VEF', "dissolve")
        if sel.kind == 'F': bmesh.ops.dissolve_faces(self.bm, faces=sel.items, use_verts=True)
        elif sel.kind == 'E': bmesh.ops.dissolve_edges(self.bm, edges=sel.items, use_verts=True, use_face_split=False)
        else: bmesh.ops.dissolve_verts(self.bm, verts=sel.items, use_face_split=False, use_boundary_tear=False)
        return self._done("dissolve", None, sel.kind)
    def delete(self, sel, keep_boundary=False):
        self._need(sel, 'VEF', "delete")
        ctx = {'V': 'VERTS', 'E': 'EDGES', 'F': 'FACES_KEEP_BOUNDARY' if keep_boundary else 'FACES'}[sel.kind]
        bmesh.ops.delete(self.bm, geom=sel.items, context=ctx)
        return self._done("delete", None, ctx)
    def merge(self, sel=None, dist=1e-4):
        before = len(self.bm.verts)
        vs = sel.verts() if sel else list(self.bm.verts)
        bmesh.ops.remove_doubles(self.bm, verts=vs, dist=dist)
        return self._done("merge", before - len(self.bm.verts), f"dist={dist}")
    def weld_center(self, sel):
        self._need(sel, 'VEF', "weld_center")
        bmesh.ops.pointmerge(self.bm, verts=sel.verts(), merge_co=self._lp(sel.center()))
        return self._done("weld_center")
    def tris_to_quads(self, sel=None, angle=40):
        fs = [f for f in (sel.faces() if sel else self.bm.faces) if len(f.verts) == 3]
        a = math.radians(angle)
        bmesh.ops.join_triangles(self.bm, faces=fs, angle_face_threshold=a, angle_shape_threshold=a)
        return self._done("tris_to_quads", None, f"from {len(fs)} tris")
    def triangulate(self, sel=None):
        fs = sel.faces() if sel else list(self.bm.faces)
        bmesh.ops.triangulate(self.bm, faces=fs, quad_method='BEAUTY', ngon_method='BEAUTY')
        return self._done("triangulate")
    def mirror_sym(self, axis='X', src='-'):
        a = axis.upper()
        d = a if src == '+' else '-' + a
        geom = list(self.bm.verts) + list(self.bm.edges) + list(self.bm.faces)
        bmesh.ops.symmetrize(self.bm, input=geom, direction=d, dist=1e-4)
        return self._done("mirror_sym", None, d)
    def recalc_normals(self):
        bmesh.ops.recalc_face_normals(self.bm, faces=list(self.bm.faces))
        return self._done("recalc_normals")
    def sharpen(self, sel, on=True):
        self._need(sel, 'EF', "sharpen")
        for ed in sel.edges(): ed.smooth = not on
        return self._done("sharpen", None, str(on))
    def _each(self, sel, fn):
        for v in sel.verts(): v.co = self.mwi @ fn(self.mw @ v.co)
    def move(self, sel, vec):
        self._need(sel, 'VEF', "move")
        bmesh.ops.translate(self.bm, vec=self._ld(vec), verts=sel.verts())
        return self._done("move", sel, str(tuple(vec)))
    def scale(self, sel, factor, pivot=None):
        self._need(sel, 'VEF', "scale")
        f = Vector((factor,) * 3) if isinstance(factor, (int, float)) else Vector(factor)
        c = Vector(pivot) if pivot is not None else sel.center()
        self._each(sel, lambda p: c + Vector((f[i] * (p[i] - c[i]) for i in range(3))))
        return self._done("scale", sel, str(tuple(f)))
    def rotate(self, sel, axis, degrees, pivot=None):
        self._need(sel, 'VEF', "rotate")
        c = Vector(pivot) if pivot is not None else sel.center()
        m = Matrix.Rotation(math.radians(degrees), 3, _dir(axis))
        self._each(sel, lambda p: c + m @ (p - c))
        return self._done("rotate", sel, f"{axis} {degrees}deg")
    def set_coord(self, sel, axis, value):
        self._need(sel, 'VEF', "set_coord")
        i = _axis_idx(axis)
        def fn(p): p = p.copy(); p[i] = value; return p
        self._each(sel, fn)
        return self._done("set_coord", sel, f"{axis}={value}")
    def flatten(self, sel, normal=None, at=None):
        self._need(sel, 'VEF', "flatten")
        n = _dir(normal) if normal is not None else sel.normal()
        c = Vector(at) if at is not None else sel.center()
        self._each(sel, lambda p: p - n * n.dot(p - c))
        return self._done("flatten", sel)
    def shrink_fatten(self, sel, dist):
        self._need(sel, 'VEF', "shrink_fatten")
        for v in sel.verts(): v.co += v.normal * dist
        return self._done("shrink_fatten", sel, f"d={dist}")
    def smooth(self, sel=None, factor=0.5, iters=1, lock=''):
        vs = sel.verts() if sel else list(self.bm.verts)
        lock = lock.upper()
        for _ in range(iters):
            bmesh.ops.smooth_vert(self.bm, verts=vs, factor=factor,
                                  use_axis_x='X' not in lock, use_axis_y='Y' not in lock,
                                  use_axis_z='Z' not in lock)
        return self._done("smooth", None, f"f={factor} x{iters}")
    def show(self, sel):
        for t in (self.bm.verts, self.bm.edges, self.bm.faces):
            for x in t: x.select_set(False)
        for x in sel.items: x.select_set(True)
        self.bm.select_flush_mode()
        return sel
    def stats(self):
        b = self.bm
        return f"V={len(b.verts)} E={len(b.edges)} F={len(b.faces)}"


class _Session:
    def __init__(self, obj, live, apply_scale, auto_clean):
        self.obj, self.live, self.apply_scale, self.auto_clean = obj, live, apply_scale, auto_clean
        self.bm = self.backup = self.ed = None
    def __enter__(self):
        o = self.obj
        if o.type != 'MESH':
            raise EditError(f"'{o.name}' is {o.type}, edit() needs a MESH")
        try:
            if bpy.context.object and bpy.context.object.mode != 'OBJECT':
                bpy.ops.object.mode_set(mode='OBJECT')
            for x in bpy.context.selected_objects: x.select_set(False)
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            if self.apply_scale and tuple(round(s, 6) for s in o.scale) != (1.0, 1.0, 1.0):
                if o.data.users > 1: o.data = o.data.copy()
                bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        except Exception:
            self.live = False
        me = o.data
        if self.live:
            try:
                bpy.ops.object.mode_set(mode='EDIT')
                self.bm = bmesh.from_edit_mesh(me)
            except Exception:
                self.live = False
        if not self.live:
            self.bm = bmesh.new(); self.bm.from_mesh(me)
        self.backup = self.bm.copy()
        self.ed = Editor(o, self.bm)
        self.ed._fix()
        return self.ed
    def __exit__(self, et, ev, tb):
        o, me = self.obj, self.obj.data
        if et is not None:
            try:
                if self.live: bpy.ops.object.mode_set(mode='OBJECT')
                self.backup.to_mesh(me); me.update()
            finally:
                self.backup.free()
                if not self.live and self.bm.is_valid: self.bm.free()
            print(f"[omni_edit] ROLLED BACK '{o.name}' ({et.__name__}: {ev}); done: {self.ed.log}")
            return False
        bm = self.bm
        if self.auto_clean:
            loose = [v for v in bm.verts if not v.link_edges]
            if loose: bmesh.ops.delete(bm, geom=loose, context='VERTS')
            if bm.faces and not any(e.is_boundary for e in bm.edges):
                bmesh.ops.recalc_face_normals(bm, faces=list(bm.faces))
        if self.live:
            bmesh.update_edit_mesh(me, loop_triangles=True, destructive=True)
            bpy.ops.object.mode_set(mode='OBJECT')
        else:
            bm.to_mesh(me); bm.free()
        me.update()
        self.backup.free()
        o["omni_edited"] = True
        print(f"[omni_edit] '{o.name}' OK  {len(self.ed.log)} ops: " + " | ".join(self.ed.log))
        return False


def edit(obj, live=True, apply_scale=True, auto_clean=True):
    if isinstance(obj, str):
        if obj not in bpy.data.objects:
            raise EditError(f"object '{obj}' not found. Existing: {[o.name for o in bpy.data.objects][:40]}")
        obj = bpy.data.objects[obj]
    return _Session(obj, live, apply_scale, auto_clean)


def edit_report(obj, sym_axis=None):
    if isinstance(obj, str): obj = bpy.data.objects[obj]
    if obj.mode == 'EDIT': obj.update_from_editmode()
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bm.verts.ensure_lookup_table()
    F = len(bm.faces)
    if F == 0:
        bm.free(); return f"EDIT_REPORT {obj.name}: EMPTY_MESH"
    tris = sum(1 for f in bm.faces if len(f.verts) == 3)
    quads = sum(1 for f in bm.faces if len(f.verts) == 4)
    ngons = F - tris - quads
    bnd = sum(1 for e in bm.edges if e.is_boundary)
    nonman = sum(1 for e in bm.edges if len(e.link_faces) > 2)
    wire = sum(1 for e in bm.edges if e.is_wire)
    loose = sum(1 for v in bm.verts if not v.link_edges)
    zero = sum(1 for f in bm.faces if f.calc_area() < 1e-10)
    stars = sum(1 for v in bm.verts if len(v.link_edges) >= 5)
    vol = sum(f.calc_center_median().dot(f.normal) * f.calc_area() for f in bm.faces) / 3.0
    kd = kdtree.KDTree(len(bm.verts))
    for i, v in enumerate(bm.verts): kd.insert(v.co, i)
    kd.balance()
    dup = sum(1 for i, v in enumerate(bm.verts) if any(j != i for _, j, _ in kd.find_range(v.co, 1e-5)))
    lens = [e.calc_length() for e in bm.edges] or [0]
    mw = obj.matrix_world
    dims = obj.dimensions
    issues = []
    if bnd: issues.append(f"OPEN_BOUNDARY:{bnd}")
    if nonman: issues.append(f"NON_MANIFOLD:{nonman}")
    if loose or wire: issues.append(f"LOOSE:{loose}v/{wire}e")
    if zero: issues.append(f"ZERO_AREA_FACES:{zero}")
    if dup: issues.append(f"DOUBLE_VERTS:{dup}")
    if ngons: issues.append(f"NGONS:{ngons}")
    if tris / F > 0.15: issues.append(f"TOO_MANY_TRIS:{tris}/{F}")
    if bnd == 0 and vol < 0: issues.append("INVERTED_NORMALS")
    if stars: issues.append(f"STAR_POLES(>=5):{stars}")
    if min(lens) < 1e-5: issues.append(f"MICRO_EDGE:{min(lens):.2e}")
    sym_line = ""
    if sym_axis:
        i = _axis_idx(sym_axis); miss = 0
        for v in bm.verts:
            p = v.co.copy(); p[i] = -p[i]
            if kd.find(p)[2] > 1e-4: miss += 1
        sym_line = f" SYM_{sym_axis.upper()}_asymmetric_verts={miss}"
        if miss: issues.append(f"ASYMMETRIC:{miss}")
    out = (f"EDIT_REPORT {obj.name}: V={len(bm.verts)} E={len(bm.edges)} F={F} "
           f"tris={tris} quads={quads} ngons={ngons} quad_ratio={quads / F:.2f}\n"
           f"EDIT_TOPO: boundary={bnd} nonmanifold={nonman} loose_v={loose} zero_area={zero} "
           f"doubles={dup} star_poles={stars} volume={vol:+.6f} edge_len=[{min(lens):.5f}..{max(lens):.5f}] "
           f"dims=({dims.x:.4f},{dims.y:.4f},{dims.z:.4f}){sym_line}\n"
           f"EDIT_ISSUES: {', '.join(issues) if issues else 'none'}")
    bm.free()
    return out


def edit_report_all(sym_axis=None):
    objs = [o for o in bpy.data.objects if o.type == 'MESH' and o.get("omni_edited")]
    objs = objs or [o for o in bpy.data.objects if o.type == 'MESH']
    return "\n".join(edit_report(o, sym_axis) for o in objs)
