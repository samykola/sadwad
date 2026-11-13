import bpy
def build_scene_snapshot():
    s=bpy.context.scene
    return {'scene':{'name':s.name,'objects':[{'name':o.name,'type':o.type,'location':list(o.location),'dimensions':list(o.dimensions),'materials':[m.name for m in (o.data.materials if hasattr(o.data,'materials') else []) if m],'modifiers':[m.name for m in o.modifiers]} for o in s.objects],'render':{'engine':s.render.engine}}}
