import bpy
def list_materials():
    return [{'name':m.name,'use_nodes':m.use_nodes} for m in bpy.data.materials]
