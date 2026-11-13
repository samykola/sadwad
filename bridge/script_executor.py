import io,sys,traceback
def run_in_bpy(code,bpy_module):
    ns={'bpy':bpy_module,'__name__':'__omniblend_exec__'}
    buf=io.StringIO(); old=sys.stdout; r={'ok':True,'output':''}
    try:
        sys.stdout=buf; exec(code,ns)
    except Exception:
        r['ok']=False; r['error']=traceback.format_exc()
    finally: sys.stdout=old
    r['output']=buf.getvalue(); return r
