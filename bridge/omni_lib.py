import bpy, bmesh, math, random, json
from mathutils import Vector

__all__ = ['mat','box','cyl','sphere','torus','lathe','polyext','tube','ring','group',
           'get','ground','set_world','studio_lights','frame_camera','render_setup',
           'finish_scene','bbox','snap_to','center_on','dup','mirror_x','clear_scene',
           'declare_spec','is_ground',
           'limb','subsurf','ellipsoid','skin_chain','torus_mesh']

def is_ground(o):
    return o.name.startswith('Ground')

def get(name):
    return bpy.data.objects[name]

def _link(o, loc, rot):
    bpy.context.scene.collection.objects.link(o)
    o.location = loc
    if rot:
        o.rotation_euler = [math.radians(a) for a in rot]
    return o

def _bm_obj(name, bm, loc, rot):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me); bm.free(); me.update()
    return _link(bpy.data.objects.new(name, me), loc, rot)

def _autosmooth(o, ang=35):
    me = o.data
    bm = bmesh.new(); bm.from_mesh(me)
    lim = math.radians(ang)
    for e in bm.edges:
        if len(e.link_faces) == 2:
            e.smooth = e.calc_face_angle(0.0) < lim
    for f in bm.faces:
        f.smooth = True
    bm.to_mesh(me); bm.free(); me.update()

def _dress(o, m=None, bevel=0.0, seg=3, smooth=True):
    if m is not None and o.type in ('MESH','CURVE'):
        o.data.materials.append(m)
    if o.type == 'MESH':
        if smooth: _autosmooth(o)
        if bevel and bevel > 0:
            b = o.modifiers.new('Bevel','BEVEL')
            b.width = bevel; b.segments = seg
            b.limit_method = 'ANGLE'; b.angle_limit = math.radians(30)
            try: b.harden_normals = True
            except: pass
    return o

def mat(name, color=(0.8,0.8,0.8), rough=0.5, metal=0.0, emit=None,
        emit_strength=3.0, alpha=1.0, bump=0.0, bump_scale=60.0, coat=0.0):
    m = bpy.data.materials.get(name)
    if m is not None: return m
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes.get('Principled BSDF') or nt.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = tuple(color)[:3] + (1.0,)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if alpha < 1.0:
        bsdf.inputs['Alpha'].default_value = alpha
        try: m.blend_method = 'BLEND'
        except: pass
    if emit:
        for k in ('Emission Color','Emission'):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = tuple(emit)[:3] + (1.0,); break
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emit_strength
    if coat > 0:
        for k in ('Coat Weight','Clearcoat'):
            if k in bsdf.inputs:
                bsdf.inputs[k].default_value = coat; break
    if bump > 0:
        noise = nt.nodes.new('ShaderNodeTexNoise')
        noise.inputs['Scale'].default_value = bump_scale
        bn = nt.nodes.new('ShaderNodeBump')
        bn.inputs['Strength'].default_value = bump
        nt.links.new(noise.outputs['Fac'], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], bsdf.inputs['Normal'])
    return m

def box(name, size, loc, m=None, bevel=0.01, rot=None, seg=3):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co.x*=size[0]; v.co.y*=size[1]; v.co.z*=size[2]
    return _dress(_bm_obj(name,bm,loc,rot), m, bevel, seg, smooth=bool(bevel))

def cyl(name, r, h, loc, m=None, r2=None, segs=32, bevel=0.0, rot=None, seg=3):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=segs,
                          radius1=r, radius2=(r if r2 is None else r2), depth=h)
    return _dress(_bm_obj(name,bm,loc,rot), m, bevel, seg)

def sphere(name, r, loc, m=None, scale=(1,1,1), segs=32, rot=None):
    bm = bmesh.new()
    try: bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(8,segs//2), radius=r)
    except TypeError: bmesh.ops.create_uvsphere(bm, u_segments=segs, v_segments=max(8,segs//2), diameter=r)
    for v in bm.verts: v.co.x*=scale[0]; v.co.y*=scale[1]; v.co.z*=scale[2]
    return _dress(_bm_obj(name,bm,loc,rot), m, 0.0)

def torus(name, R, r, loc, m=None, rot=None, ms=48, ns=16):
    bm = bmesh.new(); grid=[]
    for i in range(ms):
        a = 2*math.pi*i/ms; row=[]
        for j in range(ns):
            b = 2*math.pi*j/ns
            row.append(bm.verts.new(((R+r*math.cos(b))*math.cos(a),
                                     (R+r*math.cos(b))*math.sin(a), r*math.sin(b))))
        grid.append(row)
    for i in range(ms):
        for j in range(ns):
            bm.faces.new((grid[i][j],grid[(i+1)%ms][j],
                          grid[(i+1)%ms][(j+1)%ns],grid[i][(j+1)%ns]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _dress(_bm_obj(name,bm,loc,rot), m, 0.0)

def lathe(name, prof, loc, m=None, segs=48, rot=None, bevel=0.0):
    bm = bmesh.new(); n=len(prof); rows=[]
    for k in range(segs):
        a = 2*math.pi*k/segs; c,s = math.cos(a),math.sin(a)
        rows.append([bm.verts.new((r*c,r*s,z)) for r,z in prof])
    for k in range(segs):
        k2=(k+1)%segs
        for i in range(n-1):
            try: bm.faces.new((rows[k][i],rows[k][i+1],rows[k2][i+1],rows[k2][i]))
            except ValueError: pass
    bmesh.ops.remove_doubles(bm,verts=bm.verts,dist=1e-5)
    bmesh.ops.recalc_face_normals(bm,faces=bm.faces)
    return _dress(_bm_obj(name,bm,loc,rot),m,bevel)

def polyext(name, pts, depth, loc, m=None, bevel=0.01, rot=None, seg=3):
    bm = bmesh.new()
    vs = [bm.verts.new((x,y,-depth/2)) for x,y in pts]
    f = bm.faces.new(vs)
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    nv = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, verts=nv, vec=(0,0,depth))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return _dress(_bm_obj(name,bm,loc,rot),m,bevel,seg,smooth=bool(bevel))

def tube(name, pts, radius, m=None, loc=(0,0,0), res=8):
    cu = bpy.data.curves.new(name,'CURVE')
    cu.dimensions='3D'; cu.bevel_depth=radius
    cu.bevel_resolution=max(2,res//2); cu.use_fill_caps=True
    sp = cu.splines.new('POLY'); sp.points.add(len(pts)-1)
    for i,p in enumerate(pts): sp.points[i].co=(p[0],p[1],p[2],1.0)
    o = bpy.data.objects.new(name,cu); _link(o,loc,None)
    if m is not None: cu.materials.append(m)
    return o

def ring(n, radius, start=0.0):
    out=[]
    for i in range(n):
        a = math.radians(start)+2*math.pi*i/n
        out.append((radius*math.cos(a), radius*math.sin(a), math.degrees(a)))
    return out

def group(name, objs, loc=(0,0,0)):
    e = bpy.data.objects.new(name,None)
    bpy.context.scene.collection.objects.link(e); e.location=loc
    for o in objs: o.parent=e
    return e

# ============ ORGANIC MODELING ============

def limb(name, pts, radii, m=None, res=12, bevel_res=8):
    """Organic tapered limb: arm, leg, finger, neck, tail, tentacle, horn."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.resolution_u = res
    cu.bevel_depth = 1.0
    cu.bevel_resolution = bevel_res
    cu.use_fill_caps = True
    sp = cu.splines.new('BEZIER')
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = 'AUTO'
        bp.handle_right_type = 'AUTO'
        bp.radius = radii[i]
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    if m is not None:
        cu.materials.append(m)
    return obj

def subsurf(obj, levels=2):
    """Smooth any mesh with subdivision surface."""
    if obj.type != 'MESH': return obj
    s = obj.modifiers.new('Subsurf', 'SUBSURF')
    s.levels = levels
    s.render_levels = levels
    _autosmooth(obj, 80)
    return obj

def ellipsoid(name, size, loc, m=None, levels=3, rot=None):
    """Smooth ellipsoid for head, torso, muscle."""
    o = sphere(name, 1.0, loc, m, scale=(size[0], size[1], size[2]), segs=16, rot=rot)
    return subsurf(o, levels)

def skin_chain(name, joints, m=None, levels=2):
    """Skin modifier chain for branching organic (hands, trees, veins)."""
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    sp = cu.splines.new('POLY')
    sp.points.add(len(joints) - 1)
    for i, (x, y, z, r) in enumerate(joints):
        sp.points[i].co = (x, y, z, 1.0)
    obj = bpy.data.objects.new(name, cu)
    bpy.context.scene.collection.objects.link(obj)
    sk = obj.modifiers.new('Skin', 'SKIN')
    if levels > 0:
        ss = obj.modifiers.new('Subsurf', 'SUBSURF')
        ss.levels = levels
        ss.render_levels = levels
    if m is not None:
        cu.materials.append(m)
    return obj

def torus_mesh(name, R, r, loc, m=None, rot=None, levels=1):
    o = torus(name, R, r, loc, m=m, rot=rot, ms=24, ns=12)
    if levels > 0: subsurf(o, levels)
    return o

# ============ SCENE ============

def _geo(sc):
    return [o for o in sc.objects if o.type in ('MESH','CURVE') and not is_ground(o)]

def _bounds(objs):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    mn = Vector((1e9,)*3); mx = Vector((-1e9,)*3); ok = False
    for o in objs:
        try:
            eo = o.evaluated_get(dg)
            for c in eo.bound_box:
                w = o.matrix_world @ Vector(c)
                for i in range(3):
                    mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
                ok = True
        except: pass
    return (mn, mx) if ok else (Vector((-1,-1,0)), Vector((1,1,1)))

def ground(size=30.0, color=(0.55,0.55,0.58)):
    if any(is_ground(o) for o in bpy.context.scene.objects): return
    m = mat('Ground_Mat', color, rough=0.85)
    bm = bmesh.new(); h=size/2
    vs=[bm.verts.new(p) for p in ((-h,-h,0),(h,-h,0),(h,h,0),(-h,h,0))]
    bm.faces.new(vs)
    o = _bm_obj('Ground', bm, (0,0,0), None)
    o.data.materials.append(m)
    return o

def set_world(color=(0.06,0.065,0.08), strength=0.7):
    sc = bpy.context.scene
    if sc.world is None: sc.world = bpy.data.worlds.new('World')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs['Color'].default_value = tuple(color)[:3] + (1.0,)
        bg.inputs['Strength'].default_value = strength

def studio_lights(center=(0,0,0), size=1.0):
    c = Vector(center); s = max(size,0.3); d = s*2.6
    for n,dv,en,sz,col in [('Key',(-0.8,-1.0,0.9),900,1.6,(1.0,0.95,0.88)),
                            ('Fill',(1.0,-0.7,0.4),300,2.2,(0.85,0.92,1.0)),
                            ('Rim',(0.3,1.0,0.8),500,1.0,(1.0,1.0,1.0))]:
        v = Vector(dv).normalized()*d
        ld = bpy.data.lights.new(n,'AREA'); ld.energy=en*s*s; ld.size=sz*s; ld.color=col
        o = bpy.data.objects.new(n,ld)
        bpy.context.scene.collection.objects.link(o)
        o.location = c+v
        o.rotation_euler = (c-o.location).to_track_quat('-Z','Y').to_euler()

def frame_camera(objs=None, az=35.0, el=22.0, focal=50.0):
    sc = bpy.context.scene; objs = objs or _geo(sc)
    mn,mx = _bounds(objs); center = (mn+mx)/2
    R = max((mx-mn).length/2,0.2); fov = 2*math.atan(18.0/focal)
    dist = R/math.sin(fov/2)*1.15
    a,e = math.radians(az), math.radians(el)
    d = Vector((math.sin(a)*math.cos(e), -math.cos(a)*math.cos(e), math.sin(e)))
    cd = bpy.data.cameras.new('Camera'); cd.lens=focal
    co = bpy.data.objects.new('Camera', cd)
    sc.collection.objects.link(co)
    co.location = center+d*dist
    co.rotation_euler = (center-co.location).to_track_quat('-Z','Y').to_euler()
    sc.camera = co

def render_setup():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT','BLENDER_EEVEE'):
        try: sc.render.engine = eng; break
        except: continue
    for vt in ('AgX','Filmic'):
        try: sc.view_settings.view_transform = vt; break
        except: continue
    try: sc.view_settings.look = 'Medium High Contrast'
    except: pass
    sc.render.resolution_x = 1920; sc.render.resolution_y = 1080

def finish_scene(add_ground=True, add_lights=True, add_camera=True):
    sc = bpy.context.scene; geo = _geo(sc); log = []
    for n in ('Key','Fill','Rim','Camera'):
        old = bpy.data.objects.get(n)
        if old: bpy.data.objects.remove(old, do_unlink=True)
    dm = None
    for o in geo:
        if not any(s.material for s in o.material_slots):
            dm = dm or mat('Default_Gray',(0.6,0.6,0.62),rough=0.55)
            o.data.materials.append(dm); log.append('material:'+o.name)
    for o in geo:
        try:
            if o.type=='MESH' and not any(m.type=='BEVEL' for m in o.modifiers) and 0<len(o.data.vertices)<=600:
                dims = sorted(o.dimensions); w = min(0.02, max(0.0008, dims[0]*0.08))
                _autosmooth(o)
                b = o.modifiers.new('Bevel','BEVEL'); b.width=w; b.segments=3
                b.limit_method='ANGLE'; b.angle_limit=math.radians(30)
                try: b.harden_normals=True
                except: pass
                log.append('bevel:'+o.name)
        except: pass
    if geo:
        mn,mx = _bounds(geo)
        if abs(mn.z)>0.005:
            for o in geo:
                if o.parent is None: o.location.z -= mn.z
            for o in sc.objects:
                if o.type=='EMPTY' and o.parent is None: o.location.z -= mn.z
            log.append('dropped:%.3f'%mn.z)
    if geo: mn,mx=_bounds(geo); size=(mx-mn).length; center=(mn+mx)/2
    else: size,center = 2.0, Vector((0,0,0.5))
    if add_ground: ground(max(20.0,size*10))
    set_world()
    if add_lights and not any(o.type=='LIGHT' for o in sc.objects):
        studio_lights(center,size/1.7); log.append('lights')
    if add_camera and sc.camera is None:
        frame_camera(geo); log.append('camera')
    render_setup()
    print('[finish_scene]', ', '.join(log) if log else 'nothing to do')

def bbox(o):
    bpy.context.view_layer.update()
    dg = bpy.context.evaluated_depsgraph_get()
    eo = o.evaluated_get(dg)
    pts = [o.matrix_world @ Vector(c) for c in eo.bound_box]
    return (Vector([min(p[i] for p in pts) for i in range(3)]),
            Vector([max(p[i] for p in pts) for i in range(3)]))

def snap_to(o, ref, face='top', gap=0.0, align=True, sink=0.0, offset=(0,0,0)):
    a0,a1 = bbox(o); b0,b1 = bbox(ref); ac,bc = (a0+a1)/2,(b0+b1)/2
    i,sgn = {'top':(2,1),'bottom':(2,-1),'+x':(0,1),'-x':(0,-1),
              '+y':(1,1),'-y':(1,-1)}[face]
    d = Vector((0,0,0))
    if sgn>0: d[i] = (b1[i]+gap-sink)-a0[i]
    else: d[i] = (b0[i]-gap+sink)-a1[i]
    if align:
        for k in range(3):
            if k!=i: d[k] = bc[k]-ac[k]
    o.location += d + Vector(offset)
    return o

def center_on(o, ref, axes='xy', offset=(0,0,0)):
    a0,a1 = bbox(o); b0,b1 = bbox(ref); d = Vector((0,0,0))
    for k,ch in enumerate('xyz'):
        if ch in axes: d[k] = (b0[k]+b1[k])/2 - (a0[k]+a1[k])/2
    o.location += d + Vector(offset)
    return o

def dup(o, name, loc=None, rot=None):
    n = o.copy()
    if o.data is not None: n.data = o.data.copy()
    n.name = name; bpy.context.scene.collection.objects.link(n)
    if loc is not None: n.location = loc
    if rot is not None: n.rotation_euler = [math.radians(a) for a in rot]
    return n

def mirror_x(o, name):
    n = dup(o, name)
    n.location.x = -o.location.x
    n.rotation_euler.y = -o.rotation_euler.y
    n.rotation_euler.z = -o.rotation_euler.z
    return n

def clear_scene():
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as e:
        print('[clear_scene] mode_set failed:', e, flush=True)
    try:
        bpy.ops.object.select_all(action='SELECT')
        bpy.ops.object.delete(use_global=False)
    except Exception as e:
        print('[clear_scene] operator failed:', e, flush=True)
    for o in list(bpy.data.objects):
        try: bpy.data.objects.remove(o, do_unlink=True)
        except Exception:
            try: o.user_clear(); bpy.data.objects.remove(o, do_unlink=True)
            except Exception as e2: print('[clear_scene] failed for', o.name, ':', e2, flush=True)
    for cn in ('meshes','curves','materials','lights','cameras','images'):
        coll = getattr(bpy.data, cn, None)
        if not coll: continue
        for d in list(coll):
            try:
                if d.users == 0: coll.remove(d)
            except: pass

def declare_spec(overall=None, parts=None, **kwargs):
    try: clear_scene()
    except Exception as e: print('[declare_spec] clear failed:', e, flush=True)
    sc = bpy.context.scene
    spec = {
        'overall': [float(x) for x in overall] if overall else None,
        'parts': {k: [float(x) for x in v] for k, v in (parts or {}).items()},
    }
    sc['omni_spec'] = json.dumps(spec)
    print('[spec] overall=%s parts=%d' % (spec['overall'], len(spec['parts'])))


# ============ ATTACHMENT HELPERS (weld quality joins) ============

def handle_attached(handle_name, body_ref, radius_curve=None, res=16, radial=10, mat=None, embed=0.006):
    """C-shaped handle welded into body. Embed=meters to push tips into wall."""
    if radius_curve is None:
        radius_curve = [(0.0, 0.007), (0.5, 0.006), (1.0, 0.007)]
    B = (bpy.data.objects.get(body_ref) if isinstance(body_ref, str) else body_ref)
    if B is None:
        raise ValueError("handle_attached: body not found: " + str(body_ref))
    mn, mx = bbox(B)
    cx, cy, cz = (mn.x + mx.x) / 2, (mn.y + mx.y) / 2, (mn.z + mx.z) / 2
    outer_x = (mx.x - mn.x) / 2 + embed
    z_top = mx.z - (mx.z - mn.z) * 0.25
    z_bot = mn.z + (mx.z - mn.z) * 0.15
    N = 24
    pts = []
    for i in range(N + 1):
        t = i / N
        a = math.pi * (t - 0.5)
        x = cx + outer_x * math.cos(a)
        z = cz + (z_top - z_bot) * 0.5 * math.sin(a)
        pts.append((x, cy, z))
    def r_at(u):
        if u <= radius_curve[0][0]: return radius_curve[0][1]
        if u >= radius_curve[-1][0]: return radius_curve[-1][1]
        for i in range(len(radius_curve) - 1):
            u0, r0 = radius_curve[i]
            u1, r1 = radius_curve[i + 1]
            if u0 <= u <= u1:
                k = (u - u0) / (u1 - u0) if u1 > u0 else 0
                return r0 + k * (r1 - r0)
        return radius_curve[-1][1]
    radii = [r_at(i / N) for i in range(N + 1)]
    cu = bpy.data.curves.new(handle_name, "CURVE")
    cu.dimensions = "3D"
    cu.resolution_u = res
    cu.bevel_depth = 1.0
    cu.bevel_resolution = radial
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    sp.bezier_points.add(len(pts) - 1)
    for i, p in enumerate(pts):
        bp = sp.bezier_points[i]
        bp.co = p
        bp.handle_left_type = "AUTO"
        bp.handle_right_type = "AUTO"
        bp.radius = radii[i]
    hobj = bpy.data.objects.new(handle_name, cu)
    bpy.context.scene.collection.objects.link(hobj)
    if mat is not None:
        cu.materials.append(mat)
    try:
        if bpy.context.object and bpy.context.object.mode != "OBJECT":
            bpy.ops.object.mode_set(mode="OBJECT")
    except Exception: pass
    for o in list(bpy.context.selected_objects): o.select_set(False)
    hobj.select_set(True)
    bpy.context.view_layer.objects.active = hobj
    bpy.ops.object.convert(target="MESH")
    hobj = bpy.context.view_layer.objects.active
    boolean_union(B, hobj)
    print("[handle_attached] welded " + handle_name + " into " + B.name)
    return B


def edge_bevel(body_ref, sharp_angle=30, width=0.001, segments=2):
    """Bevel all sharp edges on the body via omni_edit."""
    try:
        from omni_edit import edit
    except Exception:
        return
    with edit(body_ref) as e:
        es = e.edges(sharp=sharp_angle)
        if len(es) > 0:
            e.bevel(es, width, segments=segments)


def add_studs(body_ref, positions, radius=0.002, height=0.0008, mat=None):
    """Add N welded bumps at given world positions."""
    B = get(body_ref) if isinstance(body_ref, str) else body_ref
    studs = []
    for i, p in enumerate(positions):
        s = cyl(body_ref + "_stud_" + str(i), radius, height, p, mat=mat, segs=16)
        studs.append(s)
    for s in studs:
        boolean_union(B, s)
    return B