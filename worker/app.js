const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const uid = () => crypto.randomUUID();
const trim = (v) => String(v ?? '').trim();
const required = (v, label) => { const s = trim(v); if (!s) throw Error(`Cần nhập ${label}`); return s; };
const num = (v, label, positive = true) => { const n = Number(v); if (!Number.isFinite(n) || (positive ? n <= 0 : n === 0)) throw Error(`${label} không hợp lệ`); return n; };
const drive = (v) => { const s = trim(v); if (!s) return ''; const u = new URL(s); if (u.protocol !== 'https:' || !['drive.google.com', 'docs.google.com'].includes(u.hostname)) throw Error('Chỉ nhận liên kết Google Drive'); return u.href; };
const q = (db, sql, ...args) => db.prepare(sql).bind(...args);
async function fileRef(db, id, purpose) {
  if (!id) return '';
  const row = await q(db, 'SELECT id FROM files WHERE id=? AND purpose=?', id, purpose).first();
  if (!row) throw Error('File đã chọn không hợp lệ');
  return '/api/file/' + row.id;
}
function fileMime(bytes) {
  const b = new Uint8Array(bytes);
  const str = (start, end) => String.fromCharCode(...b.slice(start, end));
  if (str(0, 5) === '%PDF-') return 'application/pdf';
  if (b[0] === 0x89 && str(1, 4) === 'PNG') return 'image/png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') return 'image/webp';
  return '';
}
async function upload(request, env, m) {
  permit(m, true);
  if (!env.BUCKET) throw Error('Kho file chưa được kết nối');
  const form = await request.formData();
  const file = form.get('file');
  const purpose = trim(form.get('purpose'));
  if (!file || typeof file.arrayBuffer !== 'function') throw Error('Chưa chọn file');
  if (!['support_image', 'typical', 'detail'].includes(purpose)) throw Error('Loại file không hợp lệ');
  const limit = purpose === 'support_image' ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size < 1 || file.size > limit) throw Error('File vượt giới hạn ' + (limit / 1024 / 1024) + ' MB');
  const bytes = await file.arrayBuffer();
  const mime = fileMime(bytes);
  if (purpose === 'support_image' ? !mime.startsWith('image/') : mime !== 'application/pdf') throw Error('Chỉ nhận ảnh PNG/JPG/WebP hoặc PDF đúng vị trí');
  const id = uid(), key = 'supports/' + id, filename = trim(file.name).slice(0, 180) || 'file';
  await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
  try {
    await q(env.DB, 'INSERT INTO files(id,object_key,purpose,mime,filename,size_bytes,created_by) VALUES(?,?,?,?,?,?,?)', id, key, purpose, mime, filename, file.size, m.id).run();
  } catch (e) { await env.BUCKET.delete(key); throw e; }
  await audit(env.DB, 'upload', 'file', id, m.id, purpose + ' ' + filename);
  return { id, url: '/api/file/' + id, mime, filename };
}
async function serveFile(env, m, id) {
  const row = await q(env.DB, 'SELECT * FROM files WHERE id=?', id).first();
  if (!row) return json({ error: 'Không tìm thấy file' }, 404);
  const object = await env.BUCKET.get(row.object_key);
  if (!object) return json({ error: 'File không còn trong kho' }, 404);
  return new Response(object.body, { headers: {
    'content-type': row.mime, 'content-length': String(row.size_bytes),
    'content-disposition': 'inline; filename="support-file"',
    'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff'
  } });
}
async function audit(db, action, entity, id, actor, detail = '') { await q(db, 'INSERT INTO audit(id,action,entity,entity_id,actor,detail) VALUES(?,?,?,?,?,?)', uid(), action, entity, id, actor, detail).run(); }
async function member(request, db) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = trim(request.headers.get('oai-authenticated-user-email')).toLowerCase();
  if (!id || !email) return { id: 'guest', email: 'Khách', role: 'viewer' };
  let m = await q(db, 'SELECT * FROM members WHERE id=?', id).first();
  if (!m) {
    m = await q(db, 'SELECT * FROM members WHERE email=?', email).first();
    if (m) { await q(db, 'UPDATE members SET id=? WHERE email=?', id, email).run(); m.id = id; }
    else {
      await q(db, "INSERT OR IGNORE INTO members(id,email,role) VALUES(?,?,'viewer')", id, email).run();
      m = await q(db, 'SELECT * FROM members WHERE id=?', id).first();
    }
  }
  return m || { id, email, role: 'viewer' };
}
function permit(m, admin = false) { if (admin ? m.role !== 'admin' : m.role === 'viewer') throw Error('Bạn không có quyền sửa dữ liệu'); }
async function selectedModuleIds(db, value) {
  if (!Array.isArray(value) || !value.length || value.length > 100) throw Error('Cần chọn ít nhất một module');
  const ids=[...new Set(value.map(String))];
  for (const id of ids) if (!await q(db,'SELECT id FROM modules WHERE id=?',id).first()) throw Error('Module đã chọn không hợp lệ');
  return ids;
}
async function state(db, m) {
  const tables = ['members','projects','modules','supports','support_modules','plans','batches','drawings','materials','stock_moves','stock_slips','audit'];
  const out = { me: m };
  for (const table of tables) {
    if (table === 'members' && m.role !== 'admin') { out.members = []; continue; }
    if (table === 'audit' && m.role !== 'admin') { out.audit = []; continue; }
    out[table] = (await q(db, `SELECT * FROM ${table} ORDER BY rowid DESC`).all()).results;
  }
  return out;
}
async function act(db, m, x) {
  const a = x.action, d = x.data || {}, id = /^[0-9a-f-]{36}$/i.test(x.request_id||'') ? x.request_id : uid();
  if (a === 'member') {
    permit(m, true); const email = required(d.email,'email').toLowerCase();
    if (!['admin','editor','viewer'].includes(d.role)) throw Error('Vai trò không hợp lệ');
    if (await q(db, 'SELECT id FROM members WHERE email=?', email).first()) throw Error('Tài khoản đã tồn tại; dùng Đổi quyền');
await q(db, 'INSERT INTO members(id,email,role) VALUES(?,?,?)', `pending:${email}`, email, d.role).run();
    await audit(db,a,'member',email,m.id,d.role); return;
  }
  if (a === 'member_role') {
    permit(m, true); const email = required(d.email,'email').toLowerCase();
    if (!['admin','editor','viewer'].includes(d.role)) throw Error('Vai trò không hợp lệ');
    const old = await q(db, 'SELECT role FROM members WHERE email=?', email).first();
    if (!old) throw Error('Không tìm thấy tài khoản');
    await q(db, 'UPDATE members SET role=? WHERE email=?', d.role, email).run();
    await audit(db, a, 'member', email, m.id, old.role + ' → ' + d.role); return;
  }
  if (a === 'remove_member') { permit(m,true); const email=required(d.email,'email').toLowerCase(); await q(db,'DELETE FROM members WHERE email=?',email).run(); await audit(db,a,'member',email,m.id); return; }
  permit(m);
  if (a === 'project') { permit(m,true); await q(db,'INSERT INTO projects(id,code,name) VALUES(?,?,?)',id,required(d.code,'mã dự án'),required(d.name,'tên dự án')).run(); }
  else if (a === 'project_edit') { permit(m,true); await q(db,'UPDATE projects SET code=?,name=? WHERE id=?',required(d.code,'mã dự án'),required(d.name,'tên dự án'),required(d.id,'dự án')).run(); }
  else if (a === 'module') { permit(m,true); await q(db,'INSERT INTO modules(id,project_id,code,name) VALUES(?,?,?,?)',id,required(d.project_id,'dự án'),required(d.code,'mã module'),required(d.name,'tên module')).run(); }
  else if (a === 'module_edit') { permit(m,true); const mid=required(d.id,'module'),old=await q(db,'SELECT code FROM modules WHERE id=?',mid).first();if(!old)throw Error('Không tìm thấy module');await db.batch([q(db,'INSERT OR IGNORE INTO support_modules(support_id,module_id) SELECT s.id,? FROM supports s WHERE s.code=? AND (SELECT COUNT(*) FROM modules WHERE code=?)=1 AND NOT EXISTS (SELECT 1 FROM support_modules sm WHERE sm.support_id=s.id) AND NOT EXISTS (SELECT 1 FROM plans p WHERE p.support_id=s.id)',mid,old.code,old.code),q(db,'UPDATE modules SET project_id=?,code=?,name=? WHERE id=?',required(d.project_id,'dự án'),required(d.code,'mã module'),required(d.name,'tên module'),mid)]); }
  else if (a === 'support') {
    permit(m,true);
    const moduleIds=await selectedModuleIds(db,d.module_ids);
    const image = d.image_file_id ? await fileRef(db,d.image_file_id,'support_image') : drive(d.image_url);
    await db.batch([q(db,'INSERT INTO supports(id,code,name,description,unit,image_url,note) VALUES(?,?,?,?,?,?,?)',id,'SUP-'+id,required(d.name,'tên support'),trim(d.description),trim(d.unit)||'cái',image,trim(d.note)),...moduleIds.map(mid=>q(db,'INSERT INTO support_modules(support_id,module_id) VALUES(?,?)',id,mid))]);
  }
  else if (a === 'support_edit') {
    permit(m,true);
    const sid=required(d.id,'support'),moduleIds=await selectedModuleIds(db,d.module_ids);
    const image = d.image_file_id ? await fileRef(db,d.image_file_id,'support_image') : null;
    await db.batch([q(db,'UPDATE supports SET name=?,description=?,unit=?,note=?,image_url=COALESCE(?,image_url) WHERE id=?',required(d.name,'tên support'),trim(d.description),trim(d.unit)||'cái',trim(d.note),image,sid),q(db,'DELETE FROM support_modules WHERE support_id=? AND module_id NOT IN (SELECT module_id FROM plans WHERE support_id=?)',sid,sid),...moduleIds.map(mid=>q(db,'INSERT OR IGNORE INTO support_modules(support_id,module_id) VALUES(?,?)',sid,mid))]);
  }
  else if (a === 'plan') { permit(m,true); const mid=required(d.module_id,'module'),sid=required(d.support_id,'support');await db.batch([q(db,'INSERT INTO plans(id,module_id,support_id,required) VALUES(?,?,?,?)',id,mid,sid,num(d.required,'số lượng')),q(db,'INSERT OR IGNORE INTO support_modules(support_id,module_id) VALUES(?,?)',sid,mid)]); }
  else if (a === 'start') { await q(db,'UPDATE plans SET started=1 WHERE id=?',required(d.id,'kế hoạch')).run(); }
  else if (a === 'plan_qty') { permit(m,true); const qty=num(d.required,'số lượng'); const p=await q(db,'SELECT completed FROM plans WHERE id=?',required(d.id,'kế hoạch')).first(); if (!p || qty<p.completed) throw Error('Số lượng mới nhỏ hơn số đã chế tạo'); await q(db,'UPDATE plans SET required=? WHERE id=?',qty,d.id).run(); }
  else if (a === 'batch') { if (await q(db,'SELECT id FROM batches WHERE id=?',id).first()) return; await q(db,'INSERT INTO batches(id,plan_id,qty,work_date,note,photo_url,created_by) VALUES(?,?,?,?,?,?,?)',id,required(d.plan_id,'kế hoạch'),num(d.qty,'số lượng'),required(d.work_date,'ngày'),trim(d.note),drive(d.photo_url),m.id).run(); }
  else if (a === 'void_batch') { permit(m,true); await q(db,'UPDATE batches SET voided=1,void_reason=? WHERE id=? AND voided=0',required(d.reason,'lý do hủy'),required(d.id,'đợt chế tạo')).run(); }
  else if (a === 'drawing') { permit(m,true); if (!['typical','detail'].includes(d.kind)||!['pdf','dwg','image'].includes(d.file_type)) throw Error('Loại bản vẽ không hợp lệ'); const sid=required(d.support_id,'support'); await q(db,'UPDATE drawings SET current=0 WHERE support_id=? AND kind=? AND code=?',sid,d.kind,required(d.code,'mã bản vẽ')).run(); await q(db,'INSERT INTO drawings(id,support_id,kind,code,revision,issue_date,file_url,file_type) VALUES(?,?,?,?,?,?,?,?)',id,sid,d.kind,d.code,trim(d.revision),trim(d.issue_date),drive(d.file_url),d.file_type).run(); }
  else if (a === 'drawing_upload') {
    permit(m,true);
    if (!['typical','detail'].includes(d.kind)) throw Error('Loại bản vẽ không hợp lệ');
    const sid=required(d.support_id,'support'), url=await fileRef(db,required(d.file_id,'PDF'),d.kind);
    await db.batch([
      q(db,'UPDATE drawings SET current=0 WHERE support_id=? AND kind=?',sid,d.kind),
      q(db,'INSERT INTO drawings(id,support_id,kind,code,revision,issue_date,file_url,file_type) VALUES(?,?,?,?,?,?,?,?)',id,sid,d.kind,required(d.code,'mã bản vẽ'),trim(d.revision),trim(d.issue_date),url,'pdf')
    ]);
  }
  else if (a === 'material') { await q(db,'INSERT INTO materials(id,code,name,specification,unit,note) VALUES(?,?,?,?,?,?)',id,required(d.code,'mã vật tư'),required(d.name,'tên vật tư'),trim(d.specification),required(d.unit,'đơn vị'),trim(d.note)).run(); }
  else if (a === 'move') { if (await q(db,'SELECT id FROM stock_moves WHERE id=?',id).first()) return; if (!['IN','OUT','RETURN','ADJUST'].includes(d.kind)) throw Error('Loại phiếu không hợp lệ'); if (d.kind==='ADJUST') permit(m,true); let qty=num(d.qty,'số lượng',false); if (d.kind==='OUT') qty=-Math.abs(qty); else if (d.kind!=='ADJUST') qty=Math.abs(qty); if (d.kind==='ADJUST' && !trim(d.note)) throw Error('Cần nhập lý do điều chỉnh'); await q(db,'INSERT INTO stock_moves(id,material_id,kind,qty,move_date,project_id,module_id,plan_id,source,note,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)',id,required(d.material_id,'vật tư'),d.kind,qty,required(d.move_date,'ngày'),d.project_id||null,d.module_id||null,d.plan_id||null,trim(d.source),trim(d.note),m.id).run(); }
  else if (a === 'slip_draft') {
    if (await q(db,'SELECT id FROM stock_slips WHERE id=?',id).first()) return;
    if (!['IN','OUT','RETURN','ADJUST'].includes(d.kind)) throw Error('Loại phiếu không hợp lệ');
    if (d.kind==='ADJUST') { permit(m,true); required(d.note,'lý do điều chỉnh'); }
    if (!Array.isArray(d.lines)||!d.lines.length) throw Error('Cần ít nhất một dòng vật tư');
    const lines=d.lines.map(line=>({material_id:required(line.material_id,'vật tư'),qty:num(line.qty,'số lượng',d.kind!=='ADJUST')}));
    await q(db,'INSERT INTO stock_slips(id,kind,move_date,project_id,module_id,source,note,lines_json,created_by) VALUES(?,?,?,?,?,?,?,?,?)',id,d.kind,required(d.move_date,'ngày'),d.project_id||null,d.module_id||null,trim(d.source),trim(d.note),JSON.stringify(lines),m.id).run();
  }
  else if (a === 'slip_post') {
    const slip=await q(db,'SELECT * FROM stock_slips WHERE id=?',required(d.id,'phiếu')).first();
    if (!slip) throw Error('Không tìm thấy phiếu');
    if (slip.status==='POSTED') return;
    if (slip.kind==='ADJUST') permit(m,true);
    const lines=JSON.parse(slip.lines_json);
    const commands=lines.map((line,i)=>{let qty=Number(line.qty);if(slip.kind==='OUT')qty=-Math.abs(qty);else if(slip.kind!=='ADJUST')qty=Math.abs(qty);return q(db,'INSERT INTO stock_moves(id,material_id,kind,qty,move_date,project_id,module_id,source,note,created_by,slip_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)',slip.id+':'+i,line.material_id,slip.kind,qty,slip.move_date,slip.project_id,slip.module_id,slip.source,slip.note,m.id,slip.id)});
    commands.push(q(db,"UPDATE stock_slips SET status='POSTED',posted_at=CURRENT_TIMESTAMP WHERE id=? AND status='DRAFT'",slip.id));
    await db.batch(commands);
  }
  else throw Error('Thao tác không hợp lệ');
  await audit(db,a,a,id,m.id,JSON.stringify(d).slice(0,1000));
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return json({ ok:true, database:!!env.DB });
    if (!url.pathname.startsWith('/api/')) return new Response(PAGE, { headers:{ 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store', 'content-security-policy':"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-src 'self' https://drive.google.com; img-src 'self' https://drive.google.com data:; connect-src 'self'" } });
    try {
      if (!env.DB) throw Error('Cơ sở dữ liệu chưa được kết nối');
      if (request.method === 'POST' && request.headers.get('origin') && request.headers.get('origin') !== url.origin) throw Error('Nguồn yêu cầu không hợp lệ');
      const m = await member(request, env.DB);
      if (url.pathname === '/api/upload' && request.method === 'POST') return json(await upload(request,env,m));
      if (url.pathname.startsWith('/api/file/') && request.method === 'GET') {
        const id=url.pathname.slice('/api/file/'.length);
        if (!/^[0-9a-f-]{36}$/i.test(id)) return json({error:'File không hợp lệ'},400);
        return serveFile(env,m,id);
      }
      if (url.pathname === '/api/state' && request.method === 'GET') return json(await state(env.DB,m));
      if (url.pathname === '/api/action' && request.method === 'POST') { await act(env.DB,m,await request.json()); return json({ok:true}); }
      return json({error:'Không tìm thấy'},404);
    } catch(e) { const message=String(e.message||e); return json({error:message},message==='Cần đăng nhập'?401:message.includes('quyền')?403:400); }
  }
};

const PAGE = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Quản lý support giàn khoan</title><style>
:root{font-family:Inter,system-ui,Arial,sans-serif;color:#1b2a35;background:#f4f7f8}*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}button{cursor:pointer;border:0;border-radius:9px;padding:10px 14px;background:#126d73;color:#fff;font-weight:600}button.secondary{background:#e3eeee;color:#16575c}button.danger{background:#aa3d3d}a{color:#126d73}header{background:#102d38;color:white;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:12px}header h1{font-size:19px;margin:0}header small{color:#a9ccd0}nav{display:flex;gap:8px;overflow:auto;background:#173b46;padding:10px 18px}nav button{background:transparent;color:#d7eeee;white-space:nowrap}nav button.active{background:#267982}main{max-width:1250px;margin:auto;padding:22px}.top{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.top h2{margin:0 0 16px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px}.card,.panel{background:white;border:1px solid #dbe5e7;border-radius:13px;padding:18px;box-shadow:0 2px 7px #173b460a}.metric{font-size:29px;font-weight:750;color:#145e66}.muted{color:#647982}.filters{display:flex;gap:9px;flex-wrap:wrap;margin:15px 0}input,select,textarea{border:1px solid #cbd8db;border-radius:8px;padding:10px;background:white;min-width:0}input[type=number]{width:130px}.filters input{min-width:230px;flex:1}table{width:100%;border-collapse:collapse;background:white;border-radius:12px;overflow:hidden}th,td{text-align:left;border-bottom:1px solid #e8eeee;padding:11px;vertical-align:top}th{background:#e8f1f2;color:#34515b;font-size:13px}.scroll{overflow:auto}.bar{height:8px;background:#e0ebec;border-radius:5px;min-width:75px}.bar i{display:block;height:100%;background:#2d9a8c;border-radius:5px}.badge{border-radius:20px;padding:4px 9px;background:#e9eff0;font-size:12px;white-space:nowrap}.done{background:#d9f3e9;color:#12684d}.doing{background:#e2f1fb;color:#286082}.form{display:flex;gap:9px;flex-wrap:wrap;margin:14px 0}.form>*{flex:1 1 150px}.form button{flex:0 0 auto}.section{margin:26px 0 12px}.dialog{position:fixed;inset:0;background:#102d38aa;display:flex;align-items:center;justify-content:center;padding:14px}.box{background:white;border-radius:15px;padding:20px;max-width:650px;width:100%;max-height:90vh;overflow:auto}.box h2{margin-top:0}.box label{display:block;margin:10px 0 5px;font-size:13px;font-weight:700}.box input,.box select,.box textarea{width:100%}.actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}.notice{padding:12px;background:#e4f1f2;border-radius:9px;margin:10px 0}iframe{width:100%;height:470px;border:0}#toast{position:fixed;bottom:20px;right:20px;background:#173b46;color:white;padding:12px 16px;border-radius:9px;display:none;max-width:360px}@media(max-width:650px){main{padding:14px}header{padding:13px}th,td{padding:9px;font-size:13px}.hide-mobile{display:none}.box{padding:15px}}
.docgrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin:16px 0}.doc{border:1px solid #dbe5e7;border-radius:12px;background:#f8fbfb;padding:12px;min-width:0}.doc h4{margin:0 0 10px}.doc iframe{height:340px;background:#fff;border-radius:8px}.doc img{width:100%;max-height:340px;object-fit:contain;background:#fff;border-radius:8px}.widebox{max-width:1120px}.placeholder{display:grid;place-items:center;min-height:170px;color:#60767a;border:1px dashed #b9ced0;border-radius:8px}.doc small{color:#5b7074}@media(max-width:760px){.docgrid{grid-template-columns:1fr}.doc iframe{height:290px}}
.login{display:inline-block;margin-left:12px;color:white;text-decoration:underline;text-underline-offset:3px;font-size:13px}#who{text-align:right}
.paste-preview img{display:block;max-width:100%;max-height:260px;object-fit:contain;border:1px solid #dbe5e7;border-radius:8px}.paste-preview:not(:empty){margin:10px 0}.doc .paste-hint{display:block;margin-top:8px}
.module-picks{border:1px solid #cbd8db;border-radius:8px;padding:8px 12px;max-height:220px;overflow:auto}.module-picks strong{display:block;margin:10px 0 4px}.module-picks label{display:flex;align-items:center;gap:8px;margin:5px 0;font-weight:400}.box .module-picks input[type=checkbox]{width:auto}.module-picks small{color:#647982}
</style></head><body><header><div><h1>SUPPORT CONTROL</h1><small>Quản lý chế tạo và vật tư giàn khoan</small></div><div id="who"></div></header><nav id="nav"></nav><main id="app"><div class="panel">Đang tải dữ liệu...</div></main><div id="modal"></div><div id="toast"></div><script>
let S=null,tab='overview',project='',module='',search='';const $=s=>document.querySelector(s), esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const map=(a,id)=>a.find(x=>x.id===id);const fmt=n=>Number(n||0).toLocaleString('vi-VN',{maximumFractionDigits:2});const date=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Bangkok'});const status=p=>p.completed>=p.required?'Hoàn thành':p.started||p.completed>0?'Đang làm':'Chưa làm';const can=()=>S.me.role!=='viewer';const admin=()=>S.me.role==='admin';const opts=(arr,label)=>arr.map(x=>'<option value="'+esc(x.id)+'">'+esc(label(x))+'</option>').join('');
async function load(){try{let r=await fetch('/api/state',{cache:'no-store'});let j=await r.json();if(!r.ok)throw Error(j.error);S=j;if(project&&!map(S.projects,project))project='';if(module&&(!map(S.modules,module)||project&&map(S.modules,module).project_id!==project))module='';render()}catch(e){$('#app').innerHTML='<div class="panel">'+esc(e.message)+'</div>'}}async function send(action,data){try{let r=await fetch('/api/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,data,request_id:crypto.randomUUID()})});let j=await r.json();if(!r.ok)throw Error(j.error);close();await load();toast('Đã lưu')}catch(e){toast(e.message)}}function toast(s){let e=$('#toast');e.textContent=s;e.style.display='block';setTimeout(()=>e.style.display='none',4000)}function close(){$('#modal').innerHTML=''}function dialog(title,body,action,collect){$('#modal').innerHTML='<div class="dialog"><div class="box"><h2>'+esc(title)+'</h2><form id="form">'+body+'<div class="actions"><button type="button" class="secondary" id="cancel">Đóng</button><button>Lưu</button></div></form></div></div>';$('#cancel').onclick=close;$('#form').onsubmit=e=>{e.preventDefault();let btn=e.target.querySelector('button:not([type])');btn.disabled=true;send(action,collect(new FormData(e.target))).finally(()=>btn.disabled=false)}}const field=(name,label,type='text',value='',required=true)=>'<label>'+esc(label)+'</label><input name="'+name+'" type="'+type+'" '+(type==='number'?'step="any" ':'')+'value="'+esc(value)+'" '+(required?'required':'')+'>';const select=(name,label,arr,fn,required=true)=>'<label>'+esc(label)+'</label><select name="'+name+'" '+(required&&!label.includes('(nếu có)')?'required':'')+'><option value="">Chọn...</option>'+opts(arr,fn)+'</select>';const data=f=>Object.fromEntries(f.entries());
function render(){let tabs=[['overview','Tổng quan'],['supports','Support'],['stock','Kho vật tư'],['drawings','Bản vẽ'],['admin','Quản trị']];$('#nav').innerHTML=tabs.map(([k,v])=>'<button data-tab="'+k+'" class="'+(tab===k?'active':'')+'">'+v+'</button>').join('');$('#nav').querySelectorAll('button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;load()});$('#who').innerHTML='<small>'+esc(S.me.email)+' · '+esc(S.me.role)+'</small>'+(S.me.id==='guest'?' <a class="login" href="/signin-with-chatgpt?return_to=%2F" target="_top">Đăng nhập bằng ChatGPT</a>':'');let root=$('#app');root.innerHTML=tab==='overview'?overview():tab==='supports'?supports():tab==='stock'?stock():tab==='drawings'?drawings():management();bind();document.querySelectorAll('[data-export]').forEach(b=>b.onclick=()=>exportCsv(b.dataset.export))}
function exportCsv(kind){let head=[],rows=[];if(kind==='plans'){head=['Dự án','Module','Mã support','Tên support','Đơn vị','Yêu cầu','Đã làm','Còn lại','Trạng thái'];rows=filtered().map(p=>{let m=map(S.modules,p.module_id),s=map(S.supports,p.support_id);return[map(S.projects,m?.project_id)?.code,m?.code,m?.code,s?.name,s?.unit,p.required,p.completed,p.required-p.completed,status(p)]})}else if(kind==='stock'){head=['Mã vật tư','Tên','Quy cách','Đơn vị','Tồn kho'];rows=S.materials.map(x=>[x.code,x.name,x.specification,x.unit,x.stock])}else{head=['Ngày','Mã vật tư','Loại','Số lượng','Nguồn','Ghi chú'];rows=S.stock_moves.map(x=>[x.move_date,map(S.materials,x.material_id)?.code,x.kind,x.qty,x.source,x.note])}let cell=x=>'"'+String(x??'').replaceAll('"','""')+'"';let csv='\\uFEFF'+[head,...rows].map(r=>r.map(cell).join(',')).join('\\r\\n');let url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));let a=document.createElement('a');a.href=url;a.download=kind+'-'+date()+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
function slipTable(){return '<h3 class="section">Phiếu nhiều dòng</h3><div class="scroll"><table><tr><th>Ngày</th><th>Loại</th><th>Số dòng</th><th>Trạng thái</th><th></th></tr>'+S.stock_slips.map(x=>'<tr><td>'+esc(x.move_date)+'</td><td>'+esc(x.kind)+'</td><td>'+JSON.parse(x.lines_json).length+'</td><td>'+esc(x.status)+'</td><td>'+(x.status==='DRAFT'&&can()?'<button data-post="'+esc(x.id)+'">Ghi sổ</button>':'')+'</td></tr>').join('')+'</table></div>'}
function slipForm(){let body='<label>Loại phiếu</label><select name="kind"><option value="IN">Nhập kho</option><option value="OUT">Xuất kho</option><option value="RETURN">Hoàn trả</option>'+(admin()?'<option value="ADJUST">Điều chỉnh tồn</option>':'')+'</select>'+field('move_date','Ngày','date',date())+select('project_id','Dự án (nếu có)',S.projects,x=>x.code)+select('module_id','Module (nếu có)',S.modules,x=>x.code)+field('source','Nguồn nhập / tham chiếu','text','',false)+field('note','Ghi chú / lý do điều chỉnh','text','',false)+'<h3>Dòng vật tư</h3><div id="slipLines"></div><button type="button" class="secondary" id="addline">+ Thêm dòng</button>';dialog('Lập phiếu nháp',body,'slip_draft',f=>({...data(f),lines:[...document.querySelectorAll('.slipline')].map(r=>({material_id:r.querySelector('select').value,qty:r.querySelector('input').value}))}));const add=()=>{$('#slipLines').insertAdjacentHTML('beforeend','<div class="form slipline"><select required><option value="">Chọn vật tư...</option>'+opts(S.materials,x=>x.code+' · '+x.name)+'</select><input type="number" step="any" placeholder="Số lượng" required></div>')};$('#addline').onclick=add;add()}
function filtered(){return S.plans.filter(p=>{let m=map(S.modules,p.module_id),s=map(S.supports,p.support_id);return(!project||m?.project_id===project)&&(!module||p.module_id===module)&&(!search||[m?.code,s?.name].join(' ').toLowerCase().includes(search.toLowerCase()))})}function filters(){return '<div class="filters"><select id="projectFilter"><option value="">Tất cả dự án</option>'+opts(S.projects,x=>x.code+' · '+x.name)+'</select><select id="moduleFilter"><option value="">Tất cả module</option>'+opts(S.modules.filter(x=>!project||x.project_id===project),x=>(project?'':map(S.projects,x.project_id)?.code+' / ')+x.code+' · '+x.name)+'</select><input id="search" placeholder="Tìm mã hoặc tên support" value="'+esc(search)+'"></div>'}function planTable(rows){return '<div class="scroll"><table><tr><th>Support</th><th>Module</th><th>Thực tế</th><th>Đã làm xong</th><th>Còn lại</th><th>Tiến độ</th><th>Trạng thái</th><th></th></tr>'+rows.map(p=>{let s=map(S.supports,p.support_id),m=map(S.modules,p.module_id),pc=Math.min(100,p.completed/p.required*100);return '<tr><td><b>'+esc(m?.code)+'</b><br>'+esc(s?.name)+'</td><td>'+esc(m?.code)+'</td><td>'+fmt(p.required)+'</td><td>'+fmt(p.completed)+'</td><td>'+fmt(p.required-p.completed)+'</td><td><div class="bar"><i style="width:'+pc+'%"></i></div>'+fmt(pc)+'%</td><td><span class="badge '+(pc===100?'done':status(p)==='Đang làm'?'doing':'')+'">'+status(p)+'</span></td><td><button class="secondary" data-plan="'+p.id+'">Chi tiết</button></td></tr>'}).join('')+'</table></div>'}
async function uploadFile(file,purpose){
  const form=new FormData();form.set('file',file);form.set('purpose',purpose);
  const response=await fetch('/api/upload',{method:'POST',body:form});
  const result=await response.json();if(!response.ok)throw Error(result.error||'Upload thất bại');
  return result;
}
function adminForm(title,body,handler){
  $('#modal').innerHTML='<div class="dialog"><div class="box"><h2>'+esc(title)+'</h2><form id="adminForm">'+body+'<div class="actions"><button type="button" class="secondary" id="cancel">Đóng</button><button>Lưu</button></div></form></div></div>';
  $('#cancel').onclick=close;
  $('#adminForm').onsubmit=async e=>{
    e.preventDefault();const btn=e.target.querySelector('button:not([type])');btn.disabled=true;
    try{await handler(e.target)}catch(error){toast(error.message||String(error))}finally{btn.disabled=false}
  };
}
function imageFromClipboard(e){
  const item=[...(e.clipboardData?.items||[])].find(x=>x.type.startsWith('image/'));
  const blob=item?.getAsFile();
  const ext={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[blob?.type];
  return ext?new File([blob],'support-dan-'+Date.now()+'.'+ext,{type:blob.type}):null;
}
function modulesForSupport(s){
  if(!s)return [];
  const ids=new Set((S.support_modules||[]).filter(x=>x.support_id===s.id).map(x=>x.module_id));
  S.plans.filter(x=>x.support_id===s.id).forEach(x=>ids.add(x.module_id));
  if(!ids.size){const matches=S.modules.filter(m=>m.code===s.code);if(matches.length===1)ids.add(matches[0].id)}
  return S.modules.filter(m=>ids.has(m.id));
}
function supportCode(s,mid=module,pid=project){
  if(!s)return '';
  const codes=[...new Set(modulesForSupport(s).filter(m=>(!mid||m.id===mid)&&(!pid||m.project_id===pid)).map(m=>m.code))];
  return codes.join(', ')||(!mid&&!pid?s.code:'');
}
function supportModuleFields(s){
  const assigned=new Set(modulesForSupport(s).map(m=>m.id));
  const planned=new Set(S.plans.filter(x=>x.support_id===s?.id).map(x=>x.module_id));
  return '<label>Module sử dụng support (chọn ít nhất một)</label><div class="module-picks">'+S.projects.map(p=>{
    const modules=S.modules.filter(m=>m.project_id===p.id);
    return modules.length?'<strong>'+esc(p.code)+' · '+esc(p.name)+'</strong>'+modules.map(m=>'<label><input type="checkbox" name="module_ids" value="'+esc(m.id)+'" '+(assigned.has(m.id)?'checked ':'')+(planned.has(m.id)?'disabled ':'')+'>'+esc(m.code)+' · '+esc(m.name)+(planned.has(m.id)?' <small>(đã có kế hoạch)</small>':'')+'</label>').join(''):'';
  }).join('')+'</div><p class="muted">Mã hiển thị lấy từ module đã chọn. Số lượng chế tạo được nhập riêng ở Kế hoạch.</p>';
}
function supportForm(id,initialImage){
  const s=id?map(S.supports,id):null;
  const body=supportModuleFields(s)+'<label>Mã support (theo module)</label><input id="supportCode" readonly>'+field('name','Tên support','text',s?.name||'')+field('description','Mô tả','text',s?.description||'',false)+field('unit','Đơn vị','text',s?.unit||'cái')+field('note','Ghi chú','text',s?.note||'',false)+'<label>Ảnh support (PNG, JPG, WebP; tối đa 10 MB)</label><input name="image" type="file" accept="image/png,image/jpeg,image/webp"><p class="muted">Chọn file hoặc nhấn Ctrl+V để dán ảnh đã sao chép.</p><div id="imagePastePreview" class="paste-preview"></div>'+(s?.image_url?'<p><a href="'+esc(s.image_url)+'" target="_blank">Xem ảnh hiện tại</a></p>':'');
  let selectedImage=null;
  adminForm(s?'Sửa support':'Thêm loại support',body,async form=>{
    const d=data(new FormData(form));delete d.image;d.module_ids=[...form.querySelectorAll('input[name="module_ids"]:checked')].map(x=>x.value);if(!d.module_ids.length)throw Error('Cần chọn ít nhất một module');const file=selectedImage||form.elements.image.files[0];
    if(!s&&!file)throw Error('Cần chọn hoặc dán ảnh support');
    if(file)d.image_file_id=(await uploadFile(file,'support_image')).id;
    if(s)d.id=s.id;
    await send(s?'support_edit':'support',d);
  });
  const updateCode=()=>{$('#supportCode').value=[...new Set([...document.querySelectorAll('#adminForm input[name="module_ids"]:checked')].map(x=>map(S.modules,x.value)?.code))].filter(Boolean).join(', ')};
  document.querySelectorAll('#adminForm input[name="module_ids"]').forEach(x=>x.onchange=updateCode);
  updateCode();
  const choose=file=>{
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size<1||file.size>10*1024*1024){toast('Chỉ nhận ảnh PNG, JPG, WebP tối đa 10 MB');return}
    selectedImage=file;
    const preview=$('#imagePastePreview');preview.textContent='Ảnh đã chọn: '+file.name;
    const reader=new FileReader();
    reader.onload=()=>{if(selectedImage!==file)return;const img=document.createElement('img');img.src=reader.result;img.alt='Xem trước ảnh support';preview.replaceChildren(img)};
    reader.readAsDataURL(file);
  };
  $('#adminForm [name="image"]').onchange=e=>choose(e.target.files[0]);
  $('#modal .dialog').onpaste=e=>{const file=imageFromClipboard(e);if(file){e.preventDefault();choose(file)}};
  if(initialImage)choose(initialImage);
}
function drawingForm(sid,kind){
  const selected=sid?map(S.supports,sid):null;
  const current=sid&&kind?S.drawings.find(x=>x.support_id===sid&&x.kind===kind&&x.current):null;
  const body=(selected?'<p><b>'+esc(supportCode(selected,'',''))+' · '+esc(selected.name)+'</b></p>':select('support_id','Support',S.supports,x=>supportCode(x,'','')+' · '+x.name))+(kind?'<p><b>PDF '+esc(kind)+'</b></p>':'<label>Loại bản vẽ</label><select name="kind"><option value="typical">Typical</option><option value="detail">Detail</option></select>')+field('code','Mã bản vẽ', 'text',current?.code||'')+field('revision','Revision','text','',false)+field('issue_date','Ngày phát hành','date',date(),false)+'<label>PDF một trang (tối đa 25 MB)</label><input name="pdf" type="file" accept="application/pdf,.pdf" required>';
  adminForm('Tải PDF '+(kind||'bản vẽ'),body,async form=>{
    const d=data(new FormData(form));delete d.pdf;d.support_id=sid||d.support_id;d.kind=kind||d.kind;
    d.file_id=(await uploadFile(form.elements.pdf.files[0],d.kind)).id;
    await send('drawing_upload',d);
  });
}
function currentDoc(sid,kind){return S.drawings.find(x=>x.support_id===sid&&x.kind===kind&&x.current&&x.file_type==='pdf')}
function previewUrl(url){
  if(!url)return '';
  if(url.startsWith('/api/file/'))return url;
  const marker='/file/d/',pos=url.indexOf(marker);
  if(pos>=0){const id=url.slice(pos+marker.length).split('/')[0];return 'https://drive.google.com/file/d/'+encodeURIComponent(id)+'/preview'}
  return url;
}
function documentCard(s,kind){
  if(kind==='support_image'){
    const image=s.image_url;
    return '<div class="doc" data-image-support="'+esc(s.id)+'"><h4>Ảnh support</h4>'+(image?(image.startsWith('/api/file/')?'<img src="'+esc(image)+'" alt="Ảnh '+esc(supportCode(s,'',''))+'">':'<p><a href="'+esc(image)+'" target="_blank">Mở ảnh cũ trên Drive</a></p>'):'<div class="placeholder">Chưa có ảnh</div>')+(admin()?'<small class="paste-hint">Nhấn Ctrl+V để dán ảnh mới.</small><p><button class="secondary" data-edit-support="'+esc(s.id)+'">'+(image?'Thay ảnh':'Tải ảnh')+'</button></p>':'')+'</div>';
  }
  const x=currentDoc(s.id,kind),label=kind==='typical'?'PDF typical':'PDF detail';
  return '<div class="doc"><h4>'+label+'</h4>'+(x?'<iframe title="'+label+'" src="'+esc(previewUrl(x.file_url))+'"></iframe><small>'+esc(x.code)+' · Rev '+esc(x.revision||'—')+'</small>':'<div class="placeholder">Chưa có PDF</div>')+(admin()?'<p><button class="secondary" data-upload-doc="'+kind+'" data-support-id="'+esc(s.id)+'">'+(x?'Thay PDF':'Tải PDF')+'</button></p>':'')+'</div>';
}
function editProject(id){
  const p=map(S.projects,id);
  dialog('Sửa dự án',field('code','Mã dự án','text',p.code)+field('name','Tên dự án','text',p.name),'project_edit',f=>({...data(f),id}));
}
function editModule(id){
  const m=map(S.modules,id);
  dialog('Sửa module',select('project_id','Dự án',S.projects,x=>x.code+' · '+x.name)+field('code','Mã module','text',m.code)+field('name','Tên module','text',m.name),'module_edit',f=>({...data(f),id}));
  $('#form select[name="project_id"]').value=m.project_id;
}
function editRole(email){
  const user=S.members.find(x=>x.email===email);
  dialog('Đổi quyền: '+email,'<label>Vai trò</label><select name="role"><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select>','member_role',f=>({...data(f),email}));
  $('#form select[name="role"]').value=user.role;
}
function overview(){let rows=filtered(),need=rows.reduce((n,p)=>n+p.required,0),done=rows.reduce((n,p)=>n+p.completed,0);return '<div class="top"><h2>Tổng quan chế tạo</h2><button class="secondary" data-export="plans">Xuất Excel (CSV)</button></div>'+filters()+'<div class="grid"><div class="card">Loại support<div class="metric">'+rows.length+'</div></div><div class="card">Số lượng thực tế<div class="metric">'+fmt(need)+'</div></div><div class="card">Đã làm xong<div class="metric">'+fmt(done)+'</div></div><div class="card">Còn lại<div class="metric">'+fmt(need-done)+'</div></div></div><h3 class="section">Tiến độ theo module</h3>'+planTable(rows)}
function visibleSupports(){const term=search.toLowerCase();return S.supports.filter(s=>{const linked=modulesForSupport(s).some(m=>(!project||m.project_id===project)&&(!module||m.id===module));return(!(project||module)||linked)&&(!term||[supportCode(s),s.name].join(' ').toLowerCase().includes(term))})}
function supports(){const plans=filtered(),catalog=visibleSupports();return '<div class="top"><h2>Danh sách support</h2><div><button class="secondary" data-export="plans">Xuất Excel (CSV)</button> '+(admin()?'<button data-new="support">+ Loại support</button> <button data-new="plan">+ Kế hoạch</button>':'')+'</div></div>'+filters()+(plans.length?planTable(plans):'<div class="notice">Chưa có kế hoạch support phù hợp với bộ lọc.</div>')+'<h3 class="section">Danh mục loại support</h3>'+(catalog.length?'<div class="scroll"><table><tr><th>Mã module</th><th>Tên support</th><th>Đơn vị</th><th>Mô tả</th><th></th></tr>'+catalog.map(s=>'<tr><td><b>'+esc(supportCode(s))+'</b></td><td>'+esc(s.name)+'</td><td>'+esc(s.unit)+'</td><td>'+esc(s.description)+'</td><td><button class="secondary" data-open-support="'+esc(s.id)+'">Xem</button> '+(admin()?'<button class="secondary" data-edit-support="'+esc(s.id)+'">Sửa</button>':'')+'</td></tr>').join('')+'</table></div>':'<div class="notice">'+(project||module?'Chưa có loại support gắn với module trong phạm vi đã chọn.':'Không có loại support phù hợp với từ khóa.')+'</div>')}
function stock(){return '<div class="top"><h2>Kho nguyên vật liệu</h2><div><button class="secondary" data-export="stock">Xuất tồn kho</button> <button class="secondary" data-export="moves">Xuất lịch sử</button> '+(can()?'<button data-new="material">+ Vật tư</button> <button data-new="slip">+ Phiếu nhiều dòng</button> <button data-new="move">+ Ghi nhanh một dòng</button>':'')+'</div></div><div class="scroll"><table><tr><th>Mã</th><th>Tên</th><th>Quy cách</th><th>Tồn</th><th>Đơn vị</th></tr>'+S.materials.map(x=>'<tr><td><b>'+esc(x.code)+'</b></td><td>'+esc(x.name)+'</td><td>'+esc(x.specification)+'</td><td><b>'+fmt(x.stock)+'</b></td><td>'+esc(x.unit)+'</td></tr>').join('')+'</table></div><h3 class="section">Lịch sử nhập xuất</h3><div class="scroll"><table><tr><th>Ngày</th><th>Vật tư</th><th>Loại</th><th>Số lượng</th><th>Nguồn / ghi chú</th></tr>'+S.stock_moves.map(x=>'<tr><td>'+esc(x.move_date)+'</td><td>'+esc(map(S.materials,x.material_id)?.code)+'</td><td>'+esc(x.kind)+'</td><td>'+fmt(x.qty)+'</td><td>'+esc(x.source)+' '+esc(x.note)+'</td></tr>').join('')+'</table></div>'+slipTable()}
function drawings(){return '<div class="top"><h2>Bản vẽ và hình ảnh</h2>'+(admin()?'<button data-new="drawing">+ Tải PDF</button>':'')+'</div><div class="notice">Mỗi support hiển thị PDF typical và detail hiện hành. Khi thay file, phiên bản cũ được giữ trong lịch sử.</div><div class="scroll"><table><tr><th>Support</th><th>Loại</th><th>Mã bản vẽ</th><th>Revision</th><th>Định dạng</th><th></th></tr>'+S.drawings.map(x=>'<tr><td>'+esc(supportCode(map(S.supports,x.support_id),'',''))+'</td><td>'+esc(x.kind)+'</td><td>'+esc(x.code)+'</td><td>'+esc(x.revision)+(x.current?' · hiện hành':' · cũ')+'</td><td>'+esc(x.file_type)+'</td><td><a href="'+esc(x.file_url)+'" target="_blank" rel="noopener">Mở file</a> '+(x.file_type==='pdf'?'<button class="secondary" data-preview="'+esc(x.id)+'">Xem PDF</button>':'')+'</td></tr>').join('')+'</table></div>'}
function management(){return '<div class="top"><h2>Quản trị</h2></div><div class="grid"><div class="panel"><h3>Dự án</h3>'+(admin()?'<button data-new="project">+ Dự án</button>':'')+'<p>'+S.projects.map(x=>'<span>'+esc(x.code)+' · '+esc(x.name)+(admin()?' <button class="secondary" data-edit-project="'+esc(x.id)+'">Sửa</button>':'')+'</span>').join('<br>')+'</p></div><div class="panel"><h3>Module</h3>'+(admin()?'<button data-new="module">+ Module</button>':'')+'<p>'+S.modules.map(x=>'<span>'+esc(map(S.projects,x.project_id)?.code||'Dự án không xác định')+' / '+esc(x.code)+' · '+esc(x.name)+(admin()?' <button class="secondary" data-edit-module="'+esc(x.id)+'">Sửa</button>':'')+'</span>').join('<br>')+'</p></div></div>'+(admin()?'<h3 class="section">Phân quyền</h3><div class="panel"><button data-new="member">+ Cấp quyền</button><p>'+S.members.map(x=>'<span>'+esc(x.email)+' · '+esc(x.role)+' <button class="secondary" data-role="'+esc(x.email)+'">Đổi quyền</button> <button class="secondary" data-remove="'+esc(x.email)+'">Thu hồi</button></span>').join('<br>')+'</p></div>':'')}
function bind(){
  const pf=$('#projectFilter'),mf=$('#moduleFilter'),sf=$('#search');
  if(pf){pf.value=project;pf.onchange=()=>{project=pf.value;module='';render()}}
  if(mf){mf.value=module;mf.onchange=()=>{module=mf.value;render()}}
  if(sf)sf.oninput=()=>{search=sf.value;const p=sf.selectionStart;render();$('#search')?.focus();$('#search')?.setSelectionRange(p,p)};
  document.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>form(b.dataset.new));
  document.querySelectorAll('[data-plan]').forEach(b=>b.onclick=()=>showPlan(b.dataset.plan));
  document.querySelectorAll('[data-open-support]').forEach(b=>b.onclick=()=>showSupport(b.dataset.openSupport));
  document.querySelectorAll('[data-edit-support]').forEach(b=>b.onclick=()=>supportForm(b.dataset.editSupport));
  document.querySelectorAll('[data-edit-project]').forEach(b=>b.onclick=()=>editProject(b.dataset.editProject));
  document.querySelectorAll('[data-edit-module]').forEach(b=>b.onclick=()=>editModule(b.dataset.editModule));
  document.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>editRole(b.dataset.role));
  document.querySelectorAll('[data-preview]').forEach(b=>b.onclick=()=>{
    const x=map(S.drawings,b.dataset.preview);
    $('#modal').innerHTML='<div class="dialog"><div class="box widebox"><button class="secondary" id="close">Đóng</button><h2>'+esc(x.code)+' · '+esc(x.revision)+'</h2><iframe title="Xem PDF" src="'+esc(previewUrl(x.file_url))+'"></iframe></div></div>';
    $('#close').onclick=close;
  });
  document.querySelectorAll('[data-post]').forEach(b=>b.onclick=()=>{if(confirm('Ghi sổ phiếu này?'))send('slip_post',{id:b.dataset.post})});
  document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{if(confirm('Thu hồi quyền của '+b.dataset.remove+'?'))send('remove_member',{email:b.dataset.remove})});
}
function form(k){if(k==='support')return supportForm();if(k==='drawing')return drawingForm();if(k==='slip')return slipForm();if(k==='project')dialog('Thêm dự án',field('code','Mã dự án')+field('name','Tên dự án'),k,data);if(k==='module')dialog('Thêm module',select('project_id','Dự án',S.projects,x=>x.code+' · '+x.name)+field('code','Mã module')+field('name','Tên module'),k,data);if(k==='plan')dialog('Lập kế hoạch',select('module_id','Module',S.modules,x=>x.code+' · '+x.name)+select('support_id','Loại support',S.supports,x=>supportCode(x,'','')+' · '+x.name)+field('required','Số lượng yêu cầu','number'),k,data);if(k==='material')dialog('Thêm vật tư',field('code','Mã vật tư')+field('name','Tên vật tư')+field('specification','Quy cách','text','',false)+field('unit','Đơn vị'),k,data);if(k==='drawing')dialog('Liên kết bản vẽ',select('support_id','Support',S.supports,x=>supportCode(x,'','')+' · '+x.name)+'<label>Loại</label><select name="kind"><option value="typical">Typical</option><option value="detail">Detail</option></select>'+field('code','Mã bản vẽ')+field('revision','Revision','text','',false)+field('issue_date','Ngày phát hành','date','',false)+'<label>Định dạng</label><select name="file_type"><option value="pdf">PDF</option><option value="dwg">DWG</option><option value="image">Ảnh</option></select>'+field('file_url','Link Google Drive','url'),k,data);if(k==='member')dialog('Cấp quyền',field('email','Email','email')+'<label>Vai trò</label><select name="role"><option value="viewer">Viewer</option><option value="editor">Editor</option><option value="admin">Admin</option></select>',k,data);if(k==='move')dialog('Phiếu nhập xuất',select('material_id','Vật tư',S.materials,x=>x.code+' · '+x.name)+'<label>Loại</label><select name="kind"><option value="IN">Nhập kho</option><option value="OUT">Xuất kho</option><option value="RETURN">Hoàn trả</option>'+(admin()?'<option value="ADJUST">Điều chỉnh</option>':'')+'</select>'+field('qty','Số lượng (điều chỉnh: nhập số âm hoặc dương)','number')+field('move_date','Ngày','date',date())+select('project_id','Dự án (nếu có)',[{id:'',code:'Không chọn'},...S.projects],x=>x.code)+select('module_id','Module (nếu có)',[{id:'',code:'Không chọn'},...S.modules],x=>x.code)+field('source','Nguồn nhập','text','',false)+field('note','Ghi chú / lý do','text','',false),k,data)}
function bindDocumentActions(){
  document.querySelectorAll('[data-edit-support]').forEach(b=>b.onclick=()=>supportForm(b.dataset.editSupport));
  document.querySelectorAll('[data-upload-doc]').forEach(b=>b.onclick=()=>drawingForm(b.dataset.supportId,b.dataset.uploadDoc));
  if(admin())$('#modal .dialog').onpaste=e=>{const file=imageFromClipboard(e),id=$('#modal [data-image-support]')?.dataset.imageSupport;if(file&&id){e.preventDefault();supportForm(id,file)}};
}
function showSupport(id){
  const s=map(S.supports,id),plans=S.plans.filter(p=>p.support_id===id);
  if(plans.length===1){showPlan(plans[0].id);return}
  const total=plans.reduce((n,p)=>n+p.required,0),completed=plans.reduce((n,p)=>n+p.completed,0);
  let body='<button class="secondary" id="close">Đóng</button><h2>'+esc(supportCode(s,'',''))+' · '+esc(s.name)+'</h2><div class="grid"><div class="card">Số lượng thực tế<div class="metric">'+fmt(total)+'</div></div><div class="card">Đã làm xong<div class="metric">'+fmt(completed)+'</div></div><div class="card">Còn lại<div class="metric">'+fmt(total-completed)+'</div></div></div><div class="docgrid">'+documentCard(s,'typical')+documentCard(s,'detail')+documentCard(s,'support_image')+'</div>';
  if(plans.length)body+='<h3>Tiến độ theo module</h3>'+plans.map(p=>'<p>'+esc(map(S.modules,p.module_id)?.code)+' · '+fmt(p.completed)+' / '+fmt(p.required)+' <button class="secondary" data-go-plan="'+esc(p.id)+'">Xem</button></p>').join('');
  if(admin())body+='<button data-edit-support="'+esc(s.id)+'">Sửa support</button>';
  $('#modal').innerHTML='<div class="dialog"><div class="box widebox">'+body+'</div></div>';
  $('#close').onclick=close;bindDocumentActions();
  document.querySelectorAll('[data-go-plan]').forEach(b=>b.onclick=()=>showPlan(b.dataset.goPlan));
}
function showPlan(id){
  const p=map(S.plans,id),s=map(S.supports,p.support_id),m=map(S.modules,p.module_id),bs=S.batches.filter(x=>x.plan_id===id);
  let body='<button class="secondary" id="close">Đóng</button><h2>'+esc(m.code)+' · '+esc(s.name)+'</h2><p>'+esc(m.code)+' · '+esc(status(p))+'</p><div class="grid"><div class="card">Số lượng thực tế<div class="metric">'+fmt(p.required)+'</div></div><div class="card">Đã làm xong<div class="metric">'+fmt(p.completed)+'</div></div><div class="card">Còn lại<div class="metric">'+fmt(p.required-p.completed)+'</div></div></div><div class="docgrid">'+documentCard(s,'typical')+documentCard(s,'detail')+documentCard(s,'support_image')+'</div><h3>Lịch sử chế tạo</h3>'+bs.map(x=>'<div class="notice">'+esc(x.work_date)+' · '+fmt(x.qty)+' '+esc(s.unit)+(x.voided?' · ĐÃ HỦY: '+esc(x.void_reason):'')+'<br>'+esc(x.note)+(x.photo_url?' · <a href="'+esc(x.photo_url)+'" target="_blank">Ảnh</a>':'')+(admin()&&!x.voided?' <button class="danger" data-void="'+x.id+'">Hủy đợt</button>':'')+'</div>').join('');
  if(can())body+='<div class="actions">'+(admin()?'<button class="secondary" data-edit-support="'+esc(s.id)+'">Sửa support</button>':'')+(p.started?'':'<button class="secondary" id="start">Bắt đầu chế tạo</button>')+(admin()?'<button class="secondary" id="editqty">Sửa số lượng thực tế</button>':'')+'<button id="addbatch">+ Ghi nhận chế tạo</button></div>';
  $('#modal').innerHTML='<div class="dialog"><div class="box widebox">'+body+'</div></div>';
  $('#close').onclick=close;bindDocumentActions();
  $('#start')?.addEventListener('click',()=>send('start',{id}));
  $('#editqty')?.addEventListener('click',()=>dialog('Sửa số lượng thực tế',field('required','Số lượng thực tế','number',p.required),'plan_qty',f=>({...data(f),id})));
  $('#addbatch')?.addEventListener('click',()=>dialog('Ghi nhận đã làm xong',field('qty','Số lượng hoàn thành','number')+field('work_date','Ngày','date',date())+field('photo_url','Link ảnh thực tế trên Drive','url','',false)+field('note','Ghi chú','text','',false),'batch',f=>({...data(f),plan_id:id})));
  document.querySelectorAll('[data-void]').forEach(b=>b.onclick=()=>{const reason=prompt('Nhập lý do hủy đợt chế tạo');if(reason)send('void_batch',{id:b.dataset.void,reason})});
}
$('#modal').addEventListener('click',e=>{if(e.target.classList.contains('dialog'))close()});
load();</script></body></html>`;
