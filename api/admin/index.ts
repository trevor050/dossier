export default function handler(_req: any, res: any) {
  res.setHeader('content-type', 'text/html; charset=utf-8');
  res.statusCode = 200;
  res.end(`<!doctype html>
<html lang="en">
	  <head>
	    <meta charset="UTF-8" />
	    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
	    <title>Dossier Analytics</title>
	    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
	    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
	    <style>
      :root{
        color-scheme: dark;
        --bg:#0b1020;
        --panel:rgba(255,255,255,.06);
        --border:rgba(255,255,255,.12);
        --text:rgba(255,255,255,.92);
        --muted:rgba(255,255,255,.65);
        --gold:#ffd700;
        --red:#fb7185;
        --green:#4ade80;
        --blue:#8ab4f8;
        font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"Apple Color Emoji","Segoe UI Emoji";
      }
      html,body{height:100%}
      body{margin:0;min-height:100vh;background:radial-gradient(1200px 700px at 30% 10%,#182045,var(--bg));background-repeat:no-repeat;background-attachment:fixed;color:var(--text)}
      .wrap{max-width:1180px;margin:0 auto;padding:24px}
      header{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}
      h1{margin:0;font-size:18px;letter-spacing:.3px}
      .pill{display:inline-flex;align-items:center;gap:8px;padding:8px 10px;border:1px solid var(--border);border-radius:999px;background:rgba(0,0,0,.25);color:var(--muted);font-size:12px}
      .grid{display:grid;grid-template-columns:1fr;gap:14px}
      @media (min-width: 980px){
        .grid{grid-template-columns:1.35fr .85fr;align-items:start}
      }
      .card{border:1px solid var(--border);border-radius:14px;background:var(--panel);box-shadow:0 12px 40px rgba(0,0,0,.3);overflow:hidden}
      .detailsCard{position:sticky;top:16px}
      .hd{display:flex;gap:12px;align-items:center;padding:14px 16px;border-bottom:1px solid var(--border);background:rgba(0,0,0,.18)}
      .bd{padding:14px 16px}
      .detailsCard .bd{overflow-x:auto}
      #list{overflow-x:auto}
      #list table{min-width:760px}
      .controls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}
      .btn{border:1px solid var(--border);background:rgba(0,0,0,.2);color:var(--text);padding:8px 10px;border-radius:10px;cursor:pointer}
      .btn.icon{padding:8px 14px;min-width:54px;font-size:15px}
      .btn.active{border-color:rgba(255,215,0,.35);box-shadow:0 0 0 3px rgba(255,215,0,.12)}
      .input{border:1px solid var(--border);background:rgba(0,0,0,.2);color:var(--text);padding:8px 10px;border-radius:10px;min-width:240px}
      .row{display:flex;gap:10px;align-items:center;color:var(--muted);font-size:13px}
      table{width:100%;border-collapse:collapse}
      th,td{text-align:left;padding:10px 10px;border-bottom:1px solid rgba(255,255,255,.08);vertical-align:top}
      th{color:var(--muted);font-weight:600;font-size:12px}
      tr:hover td{background:rgba(255,255,255,.03);cursor:pointer}
      tr.sel td{background:rgba(255,215,0,.08)}
      tr.expand td{background:rgba(0,0,0,.22);cursor:default}
      .split{display:grid;grid-template-columns:1fr;gap:12px;align-items:start}
      @media (min-width: 980px){ .split{grid-template-columns:1fr 1fr} }
      .tag{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:var(--muted);font-size:12px}
      .tag.good{border-color:rgba(74,222,128,.25);color:rgba(74,222,128,.95)}
      .tag.bad{border-color:rgba(251,113,133,.35);color:rgba(251,113,133,.95)}
      .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:12px;color:var(--muted)}
      .pre{white-space:pre-wrap;background:rgba(0,0,0,.25);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:10px;color:rgba(255,255,255,.82);font-size:12px}
      .center{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
      .auth{max-width:560px;width:100%}
      .auth h2{margin:0 0 10px 0;font-size:16px}
      .auth p{margin:0 0 16px 0;color:var(--muted);font-size:13px}
      .kpis{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px}
      .kpi{border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.14);border-radius:12px;padding:10px 12px;min-width:160px}
      .kpi .n{font-size:16px;color:var(--text);font-weight:700}
      .kpi .l{font-size:12px;color:var(--muted);margin-top:2px}
      .timeline{display:grid;gap:8px}
	      .evt{display:grid;grid-template-columns:72px 1fr;gap:10px;padding:10px;border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18);border-radius:12px}
	      .evt .t{color:var(--muted);font-size:12px}
	      .evt .h{font-size:13px;color:var(--text);font-weight:650}
	      .evt .d{font-size:12px;color:var(--muted);margin-top:2px}
	      #map{height:450px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.10);background:rgba(0,0,0,.18)}
	      .leaflet-container{background:rgba(0,0,0,.18)}
	    </style>
	  </head>
  <body>
    <div id="authRoot" class="center">
      <div class="card auth">
        <div class="hd"><div class="row">Admin panel authentication</div></div>
        <div class="bd">
          <h2>Enter admin token</h2>
          <p>This dashboard stays hidden until a valid token is provided.</p>
          <div class="controls">
            <input class="input" id="token" type="password" placeholder="ADMIN_TOKEN" />
            <button class="btn" id="continue">Continue</button>
            <button class="btn" id="forget" style="display:none">Forget</button>
          </div>
          <div class="row" id="authMsg" style="margin-top:10px"></div>
        </div>
      </div>
    </div>

    <div id="appRoot" style="display:none">
	      <div class="wrap">
	        <header>
	          <div>
	            <h1>Analytics</h1>
	          </div>
	          <div class="controls">
	            <button class="btn" id="logout">Logout</button>
	          </div>
	        </header>

        <div class="grid">
          <div class="card">
	            <div class="hd">
	              <div class="controls">
	                <button class="btn" id="btnDashboard">Dashboard</button>
	                <button class="btn active" id="btnVisitors">Visitors</button>
	                <button class="btn" id="btnSessions">Sessions</button>
	                <button class="btn" id="btnBots">Bots</button>
	                <button class="btn" id="btnMap">Map</button>
	                <button class="btn" id="btnSettings">Settings</button>
	                <label class="tag" id="showBotsWrap" style="display:none"><input id="showBots" type="checkbox" /> include bots</label>
	                <label class="tag" id="visitorBotsWrap" style="display:none"><input id="showBotsVisitors" type="checkbox" /> include bots</label>
	                <label class="tag" id="mapBotsWrap" style="display:none"><input id="mapBots" type="checkbox" /> include bots</label>
	                <input class="input" id="search" placeholder="Search…" />
	                <span class="pill" id="lastUpdated" title="Last updated">—</span>
	                <button class="btn icon" id="refresh" title="Refresh">⟳</button>
	              </div>
	            </div>
            <div class="bd" id="list">Loading…</div>
          </div>

          <div class="card detailsCard">
	            <div class="hd">
	              <div class="controls" style="width:100%">
	                <div class="row" style="flex:1">Details</div>
	                <label class="tag" id="rawWrap" style="display:none"><input id="rawToggle" type="checkbox" /> raw</label>
	              </div>
	            </div>
            <div class="bd" id="details">Select a session to view details.</div>
          </div>
        </div>
      </div>
    </div>

    <script>
      const $ = (id) => document.getElementById(id);
      const state = {
          view:'visitors',
          sessions:[],
          visitors:[],
          showBots:false,
          visitorsShowBots:false,
          mapShowBots:false,
          search:'',
          raw:false,
          selectedSid:null,
          expandedSid:null,
          selectedVid:null,
          overview:null,
          bots:null,
          map:null,
          settings:null,
          theme:'midnight',
          sessionsPage:1,
          cache:{ sessionLite:{}, sessionFull:{}, visitor:{} },
          lastUpdatedAt:null,
        };

      function readCookie(name){
        const m=document.cookie.match(new RegExp('(?:^|; )'+name.replace(/[.$?*|{}()\\[\\]\\\\\\/\\+^]/g,'\\\\$&')+'=([^;]*)'));
        return m?decodeURIComponent(m[1]):'';
      }
      function writeCookie(name,value){
        const secure=location.protocol==='https:'?'; Secure':'';
        document.cookie=name+'='+encodeURIComponent(value)+'; Max-Age=31536000; Path=/api/admin; SameSite=Strict'+secure;
      }
      function clearCookie(name){
        const secure=location.protocol==='https:'?'; Secure':'';
        document.cookie=name+'=; Max-Age=0; Path=/api/admin; SameSite=Strict'+secure;
      }
      function getToken(){ return readCookie('admin_token') || localStorage.getItem('admin_token') || ''; }
      function setToken(t){ localStorage.setItem('admin_token',t); writeCookie('admin_token',t); }
      function forgetToken(){ localStorage.removeItem('admin_token'); clearCookie('admin_token'); }

      async function loadStatus(token){
        try{
          const headers={accept:'application/json'};
          if(token) headers.authorization = 'Bearer ' + token;
          const r=await fetch('/api/admin/status',{headers});
          if(!r.ok) return null;
          return await r.json();
        }catch{ return null; }
      }
      async function checkAuth(token){
        try{
          const r=await fetch('/api/admin/auth',{headers:{authorization: token?('Bearer '+token):''}});
          return r.status===204;
        }catch{ return false; }
      }

      function showAuth(msg,isErr){
        $('authMsg').textContent=msg||'';
        $('authMsg').style.color=isErr?'var(--red)':'var(--muted)';
        $('forget').style.display=getToken()?'':'none';
      }
      function showApp(){
        $('authRoot').style.display='none';
        $('appRoot').style.display='';
      }
      function refreshVisitorUI(){
        if(state.selectedVid) void loadVisitor(state.selectedVid);
        void loadVisitors();
      }
      function setTheme(theme){
        const root = document.documentElement;
        if(theme==='ember'){
          root.style.setProperty('--bg','#120b0b');
          root.style.setProperty('--panel','rgba(255,214,204,.06)');
          root.style.setProperty('--border','rgba(255,214,204,.18)');
          root.style.setProperty('--text','rgba(255,248,244,.95)');
          root.style.setProperty('--muted','rgba(255,206,196,.65)');
          root.style.setProperty('--gold','#ffb86b');
        }else if(theme==='sand'){
          root.style.setProperty('--bg','#10100b');
          root.style.setProperty('--panel','rgba(245,232,200,.08)');
          root.style.setProperty('--border','rgba(245,232,200,.18)');
          root.style.setProperty('--text','rgba(255,250,240,.95)');
          root.style.setProperty('--muted','rgba(240,226,195,.65)');
          root.style.setProperty('--gold','#f6d365');
        }else if(theme==='mint'){
          root.style.setProperty('--bg','#081014');
          root.style.setProperty('--panel','rgba(196,255,242,.08)');
          root.style.setProperty('--border','rgba(196,255,242,.18)');
          root.style.setProperty('--text','rgba(232,255,250,.95)');
          root.style.setProperty('--muted','rgba(186,245,234,.65)');
          root.style.setProperty('--gold','#6ee7b7');
        }else{
          root.style.setProperty('--bg','#0b1020');
          root.style.setProperty('--panel','rgba(255,255,255,.06)');
          root.style.setProperty('--border','rgba(255,255,255,.12)');
          root.style.setProperty('--text','rgba(255,255,255,.92)');
          root.style.setProperty('--muted','rgba(255,255,255,.65)');
          root.style.setProperty('--gold','#ffd700');
        }
      }
      function setLastUpdated(ts){
        state.lastUpdatedAt = ts || new Date();
        const el = $('lastUpdated');
        if(!el) return;
        try{
          el.textContent = state.lastUpdatedAt.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'});
        }catch{
          el.textContent = 'updated';
        }
      }

      function api(path){
        const token=getToken();
        return fetch(path,{headers:{accept:'application/json',authorization: token?('Bearer '+token):''}}).then(async (r)=>{
          if(!r.ok) throw new Error(await r.text());
          return r.json();
        });
      }

      function fmtDate(v){ if(!v) return ''; try{ return new Date(v).toLocaleString(); }catch{ return String(v); } }
      function fmtTime(v){ if(!v) return ''; try{ return new Date(v).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit',second:'2-digit'}); }catch{ return ''; } }
      function fmtSec(v){
        if(v==null || Number.isNaN(Number(v))) return '—';
        const n=Math.round(Number(v));
        if(n<60) return n+'s';
        const m=Math.floor(n/60), s=n%60;
        return m+'m '+s+'s';
      }
      function str(v){ return v==null?'':String(v); }
      function contains(h,n){ return str(h).toLowerCase().includes(String(n).toLowerCase()); }

      function matchesSearch(row){
        if(!state.search) return true;
        const n=state.search.trim().toLowerCase();
        if(!n) return true;
        return (
          contains(row.ip,n) ||
          contains(row.ptr,n) ||
          contains(row.display_name,n) ||
          contains(row.vid,n) ||
          contains(row.sid,n) ||
          contains(row.city,n) ||
          contains(row.region,n) ||
          contains(row.country,n) ||
          contains(row.org,n) ||
          contains(row.asn,n) ||
          contains(row.user_agent,n)
        );
      }

      function renderSessions(){
        const rows=state.sessions.filter(matchesSearch);
        if(!rows.length){ $('list').innerHTML='<div class=\"row\">No sessions found.</div>'; return; }
        const pageSize = 8;
        const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
        if(state.sessionsPage > pageCount) state.sessionsPage = 1;
        const page = Math.max(1, state.sessionsPage || 1);
        const start = (page - 1) * pageSize;
        const pageRows = rows.slice(start, start + pageSize);
        function inlineHtmlForSid(sid){
          const cached = state.cache.sessionLite[sid];
          if(!cached) return '<div class=\"row\">Loading session…</div>';
          const s = cached.session || {};
          const events = cached.events || [];

          const bits=[];
          if(s.page) bits.push('page '+str(s.page));
          if(s.referrer_host) bits.push('ref '+str(s.referrer_host));
          if(s.first_interaction_seconds!=null) bits.push('first action '+fmtSec(s.first_interaction_seconds));
          if(s.interactions!=null) bits.push('actions '+s.interactions);
          if(s.active_seconds!=null) bits.push('active '+fmtSec(s.active_seconds));
          if(s.session_seconds!=null) bits.push('total '+fmtSec(s.session_seconds));
          if(s.bot_reasons) bits.push('bot: '+str(s.bot_reasons));
          if(s.session_cookie_id) bits.push('scid '+str(s.session_cookie_id));
          if(s.fingerprint_id) bits.push('fp '+str(s.fingerprint_id));
          if(s.ref_tag) bits.push('ref '+str(s.ref_tag));

          const last = events.length ? events[events.length-1] : null;
          const lastLine = last ? ('Last event: <span class=\"mono\">'+str(last.type)+'</span> @ <span class=\"mono\">'+fmtTime(last.ts)+'</span>') : 'No events captured yet.';
          return (
            '<div class=\"row\" style=\"justify-content:space-between;gap:12px;flex-wrap:wrap\">'+
              '<div class=\"row\" style=\"gap:12px;flex-wrap:wrap\">'+
                '<span class=\"tag\">'+(s.is_bot?'bot':'human?')+'</span>'+
                '<span class=\"mono\">'+(s.ip||'')+'</span>'+
                (s.ptr?('<span class=\"mono\">'+s.ptr+'</span>'):'')+
              '</div>'+
            '</div>'+
            '<div class=\"row\" style=\"margin-top:8px\">'+(bits.join(' • ')||'<span class=\"mono\">(no summary yet)</span>')+'</div>'+
            '<div class=\"row\" style=\"margin-top:6px\">'+lastLine+'</div>'
          );
        }

        const body=[];
        for(const s of pageRows){
          const flag=s.is_bot?'<span class=\"tag bad\">bot</span>':'<span class=\"tag good\">human?</span>';
          const loc=[s.city,s.region,s.country].filter(Boolean).join(', ');
          const net=[s.asn,s.as_name].filter(Boolean).join(' ');
          const where=loc || (net?net:'');
          const who=s.org || s.ptr || s.ip || '';
          const summaryBits=[];
          if(s.active_seconds!=null) summaryBits.push('active '+fmtSec(s.active_seconds));
          if(s.idle_seconds!=null) summaryBits.push('idle '+fmtSec(s.idle_seconds));
          if(s.session_seconds!=null) summaryBits.push('total '+fmtSec(s.session_seconds));
          if(s.interactions!=null) summaryBits.push('actions '+s.interactions);
          if(s.overlays_unique!=null) summaryBits.push('sections '+s.overlays_unique);
          const device=(s.is_mobile===true?'mobile':'desktop')+(s.orientation?' ('+s.orientation+')':'');
          const sel = (state.selectedSid===s.sid) ? ' sel' : '';
          body.push(
            '<tr class=\"sessionRow'+sel+'\" data-sid=\"'+s.sid+'\">'+
              '<td>'+fmtDate(s.started_at)+
                '<div class=\"mono\">'+(s.display_name || s.vid_short || '')+'</div>'+
                (s.display_name ? ('<div class=\"mono\">'+(s.vid_short||'')+'</div>') : '')+
              '</td>'+
              '<td>'+(where||'<span class=\"mono\">(unknown)</span>')+'</td>'+
              '<td>'+(who?('<div class=\"mono\">'+who+'</div>'):'<span class=\"mono\">(unknown)</span>')+'</td>'+
              '<td>'+device+'</td>'+
              '<td>'+(summaryBits.join(' • ')||'<span class=\"mono\">(no summary yet)</span>')+'</td>'+
              '<td>'+flag+'</td>'+
            '</tr>'
          );
          if(state.expandedSid===s.sid){
            body.push('<tr class=\"expand\" data-expand=\"'+s.sid+'\"><td colspan=\"6\">'+inlineHtmlForSid(s.sid)+'</td></tr>');
          }
        }

        const pager = pageCount > 1
          ? '<div class=\"controls\" style=\"margin-top:10px\">'+
              '<button class=\"btn\" id=\"pagePrev\">Prev</button>'+
              '<span class=\"pill\">Page '+page+' / '+pageCount+'</span>'+
              '<button class=\"btn\" id=\"pageNext\">Next</button>'+
            '</div>'
          : '';
        const html=[
          '<table>',
          '<thead><tr>',
          '<th>When</th><th>Where</th><th>Identity</th><th>Device</th><th>Summary</th><th>Flags</th>',
          '</tr></thead>',
          '<tbody>',
          ...body,
          '</tbody></table>',
          pager
        ].join('');
        $('list').innerHTML=html;
        $('list').querySelectorAll('tr.sessionRow[data-sid]').forEach((tr)=>{
          tr.addEventListener('click', ()=>{
            const sid=tr.getAttribute('data-sid');
            if(!sid) return;
            if(state.expandedSid===sid){
              state.expandedSid=null;
              render();
              return;
            }
            state.expandedSid=sid;
            state.selectedSid=sid;
            render();
            void loadSessionLite(sid);
            setTimeout(()=>{ void loadSession(sid); }, 0);
          });
        });
        const prev=$('pagePrev');
        if(prev) prev.addEventListener('click', ()=>{
          state.sessionsPage = Math.max(1, page - 1);
          renderSessions();
        });
        const next=$('pageNext');
        if(next) next.addEventListener('click', ()=>{
          state.sessionsPage = Math.min(pageCount, page + 1);
          renderSessions();
        });
      }

      function renderVisitors(){
        const rows=state.visitors.filter(matchesSearch);
        if(!rows.length){ $('list').innerHTML='<div class=\"row\">No visitors found.</div>'; return; }
        const html=[
          '<table>',
          '<thead><tr>',
          '<th>Entity</th><th>Visitor</th><th>Sessions</th><th>Last seen</th><th>Last session</th><th>Ref</th><th>Identity</th><th>From</th><th>Last IP</th>',
          '</tr></thead>',
          '<tbody>',
          ...rows.map((v)=>{
            const loc=[v.city,v.region,v.country].filter(Boolean).join(', ');
            const who=v.org || v.ptr || (loc?loc:'');
            const sel = (state.selectedVid===v.vid) ? ' sel' : '';
            return (
              '<tr class=\"visitorRow'+sel+'\" data-vid=\"'+v.vid+'\">'+
                '<td><div class=\"mono\">'+(v.cluster_name||'')+'</div><div class=\"mono\">'+(v.cluster_id||'')+'</div></td>'+
                '<td>'+('<div class=\"mono\">'+(v.display_name||v.vid.slice(0,8))+'</div>')+
                  '<div class=\"mono\">'+v.vid.slice(0,8)+'</div>'+
                '</td>'+
                '<td>'+(v.sessions!=null?String(v.sessions):'—')+'</td>'+
                '<td>'+fmtDate(v.last_seen_at)+'</td>'+
                '<td>'+fmtDate(v.last_session_at)+'</td>'+
                '<td>'+(v.last_ref_tag?('<div class=\"mono\">'+v.last_ref_tag+'</div>'):'<span class=\"mono\">(none)</span>')+'</td>'+
                '<td>'+(who?('<div class=\"mono\">'+who+'</div>'):'<span class=\"mono\">(unknown)</span>')+'</td>'+
                '<td>'+(loc?('<div class=\"mono\">'+loc+'</div>'):'<span class=\"mono\">(unknown)</span>')+'</td>'+
                '<td class=\"mono\">'+(v.last_ip||'')+'</td>'+
              '</tr>'
            );
          }),
          '</tbody></table>'
        ].join('');
        $('list').innerHTML=html;
        $('list').querySelectorAll('tr.visitorRow[data-vid]').forEach((tr)=>{
          tr.addEventListener('click', async ()=>{
            const vid=tr.getAttribute('data-vid');
            if(!vid) return;
            state.selectedVid = vid;
            renderVisitors();
            await loadVisitor(vid);
          });
        });
      }

      function sparkline(points){
        const w=520, h=80, pad=6;
        const xs=points.map(p=>p.x), ys=points.map(p=>p.y);
        const minX=Math.min(...xs), maxX=Math.max(...xs);
        const minY=Math.min(...ys), maxY=Math.max(...ys);
        const sx=(x)=> pad + (maxX===minX?0:((x-minX)/(maxX-minX)))*(w-2*pad);
        const sy=(y)=> h-pad - (maxY===minY?0:((y-minY)/(maxY-minY)))*(h-2*pad);
        const d=points.map((p,i)=>(i===0?'M':'L')+sx(p.x).toFixed(1)+','+sy(p.y).toFixed(1)).join(' ');
        return '<svg viewBox=\"0 0 '+w+' '+h+'\" width=\"100%\" height=\"80\" style=\"display:block\">'+
          '<path d=\"'+d+'\" fill=\"none\" stroke=\"rgba(255,215,0,.7)\" stroke-width=\"2\" />'+
        '</svg>';
      }

      function sparkline2(a,b){
        const pts=[...(a||[]),...(b||[])];
        if(pts.length<2) return '';
        const w=520, h=90, pad=8;
        const xs=pts.map(p=>p.x), ys=pts.map(p=>p.y);
        const minX=Math.min(...xs), maxX=Math.max(...xs);
        const minY=Math.min(...ys), maxY=Math.max(...ys);
        const sx=(x)=> pad + (maxX===minX?0:((x-minX)/(maxX-minX)))*(w-2*pad);
        const sy=(y)=> h-pad - (maxY===minY?0:((y-minY)/(maxY-minY)))*(h-2*pad);
        const path=(points)=> points.map((p,i)=>(i===0?'M':'L')+sx(p.x).toFixed(1)+','+sy(p.y).toFixed(1)).join(' ');
        const da=path(a||[]);
        const db=path(b||[]);
        return '<svg viewBox=\"0 0 '+w+' '+h+'\" width=\"100%\" height=\"90\" style=\"display:block\">'+
          '<path d=\"'+da+'\" fill=\"none\" stroke=\"rgba(255,215,0,.75)\" stroke-width=\"2\" />'+
          '<path d=\"'+db+'\" fill=\"none\" stroke=\"rgba(138,180,248,.85)\" stroke-width=\"2\" />'+
        '</svg>';
      }

      function renderDashboard(){
        const o=state.overview;
        if(!o){ $('list').innerHTML='<div class=\"row\">Loading…</div>'; $('details').innerHTML=''; return; }

        const totals=o.totals||{};
        const kpis=[
          ['DAU', String(o.dau||0)],
          ['WAU', String(o.wau||0)],
          ['MAU', String(o.mau||0)],
          ['Visitors', String(totals.visitors||0)],
          ['Human sessions', String(totals.sessions_human||0)],
          ['Events', String(totals.events||0)],
          ['Returning (30d)', String(o.returning_visitors_30d||0)],
        ].map(([l,n])=>'<div class=\"kpi\"><div class=\"n\">'+n+'</div><div class=\"l\">'+l+'</div></div>').join('');

        const byDaySessions=(o.by_day_365d||[]).map((r,i)=>({x:i,y:Number(r.sessions||0)}));
        const byDayVisitors=(o.by_day_365d||[]).map((r,i)=>({x:i,y:Number(r.visitors||0)}));
        const chart=byDaySessions.length>=2 ? sparkline2(byDaySessions, byDayVisitors) : '';
        const period=o.period_30d||{};
        const changeTag=(pct)=>{
          if(pct==null) return '<span class=\"tag\">new</span>';
          const cls=pct>=0?'good':'bad';
          const sign=pct>=0?'+':'';
          return '<span class=\"tag '+cls+'\">'+sign+pct+'%</span>';
        };

        const dauChart = byDayVisitors.length>=2 ? sparkline(byDayVisitors) : '';
        const sessionChart = byDaySessions.length>=2 ? sparkline(byDaySessions) : '';

        $('list').innerHTML=
          '<div class=\"row\" style=\"margin-bottom:8px\">Last 12 months</div>'+
          '<div class=\"kpis\">'+kpis+'</div>'+
          (chart?(
            '<div style=\"margin-top:10px\">'+chart+'</div>'+
            '<div class=\"row\" style=\"margin-top:6px\"><span class=\"tag\" style=\"border-color:rgba(255,215,0,.35)\">sessions</span><span class=\"tag\" style=\"border-color:rgba(138,180,248,.35)\">visitors</span></div>'
          ):'')+
          '<div class=\"split\" style=\"margin-top:12px\">'+
            '<div class=\"card\" style=\"border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18)\">'+
              '<div class=\"bd\"><div class=\"row\" style=\"margin-bottom:6px\">Active users (daily)</div>'+(dauChart||'<div class=\"row\">Not enough data yet.</div>')+'</div>'+
            '</div>'+
            '<div class=\"card\" style=\"border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18)\">'+
              '<div class=\"bd\"><div class=\"row\" style=\"margin-bottom:6px\">Daily sessions</div>'+(sessionChart||'<div class=\"row\">Not enough data yet.</div>')+'</div>'+
            '</div>'+
          '</div>'+
          '<div class=\"split\" style=\"margin-top:12px\">'+
            '<div class=\"card\" style=\"border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18)\">'+
              '<div class=\"bd\"><div class=\"row\" style=\"margin-bottom:6px\">Sessions (last 30d vs prior)</div>'+
                '<div class=\"row\"><span class=\"mono\">'+(period.sessions||0)+'</span>'+changeTag(period.sessions_change_pct)+'</div></div>'+
            '</div>'+
            '<div class=\"card\" style=\"border:1px solid rgba(255,255,255,.08);background:rgba(0,0,0,.18)\">'+
              '<div class=\"bd\"><div class=\"row\" style=\"margin-bottom:6px\">Visitors (last 30d vs prior)</div>'+
                '<div class=\"row\"><span class=\"mono\">'+(period.visitors||0)+'</span>'+changeTag(period.visitors_change_pct)+'</div></div>'+
            '</div>'+
          '</div>';

        const ref=(o.top_referrers_30d||[]).slice(0,10).map(r=>'<tr><td class=\"mono\">'+(r.host||'')+'</td><td>'+r.sessions+'</td></tr>').join('');
        const pages=(o.top_pages_30d||[]).slice(0,10).map(r=>'<tr><td class=\"mono\">'+(r.page||'')+'</td><td>'+r.sessions+'</td></tr>').join('');
        const opens=(o.top_overlays_open_30d||[]).slice(0,10).map(r=>'<tr><td class=\"mono\">'+(r.overlay||'(unknown)')+'</td><td>'+r.opens+'</td></tr>').join('');
        const dwell=(o.top_overlays_dwell_30d||[]).slice(0,10).map(r=>'<tr><td class=\"mono\">'+(r.overlay||'(unknown)')+'</td><td>'+fmtSec(r.dwell_s||0)+'</td></tr>').join('');

        $('details').innerHTML=
          '<div class=\"split\">'+
            '<div><div class=\"row\" style=\"margin-bottom:8px\">Top referrers</div>'+ (ref?('<table><thead><tr><th>Host</th><th>Sessions</th></tr></thead><tbody>'+ref+'</tbody></table>'):'<div class=\"row\">None</div>') +'</div>'+
            '<div><div class=\"row\" style=\"margin-bottom:8px\">Top pages</div>'+ (pages?('<table><thead><tr><th>Page</th><th>Sessions</th></tr></thead><tbody>'+pages+'</tbody></table>'):'<div class=\"row\">None</div>') +'</div>'+
          '</div>'+
          '<div class=\"split\" style=\"margin-top:12px\">'+
            '<div><div class=\"row\" style=\"margin-bottom:8px\">Sections opened</div>'+ (opens?('<table><thead><tr><th>Section</th><th>Opens</th></tr></thead><tbody>'+opens+'</tbody></table>'):'<div class=\"row\">None</div>') +'</div>'+
            '<div><div class=\"row\" style=\"margin-bottom:8px\">Time in sections</div>'+ (dwell?('<table><thead><tr><th>Section</th><th>Time</th></tr></thead><tbody>'+dwell+'</tbody></table>'):'<div class=\"row\">None</div>') +'</div>'+
          '</div>';
      }

      function renderBots(){
        const b=state.bots;
        if(!b){ $('list').innerHTML='<div class=\"row\">Loading…</div>'; $('details').innerHTML=''; return; }
        const reasons=(b.reasons||[]).slice(0,12).map(r=>'<tr><td class=\"mono\">'+r.reason+'</td><td>'+r.count+'</td></tr>').join('');
        const uas=(b.user_agents||[]).slice(0,10).map(r=>'<tr><td class=\"mono\">'+(r.user_agent||'')+'</td><td>'+r.count+'</td></tr>').join('');
        const sessions=(b.sessions||[]);
        const uniqueIps=new Set(sessions.map(s=>s.ip).filter(Boolean)).size;
        const uniqueVisitors=new Set(sessions.map(s=>s.vid).filter(Boolean)).size;
        $('list').innerHTML=
          '<div class=\"row\" style=\"margin-bottom:8px\">Bot sessions (last '+b.days+' days)</div>'+
          '<div class=\"kpis\" style=\"margin-bottom:10px\">'+
            '<div class=\"kpi\"><div class=\"n\">'+String(sessions.length)+'</div><div class=\"l\">sessions</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+String(uniqueVisitors)+'</div><div class=\"l\">visitors</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+String(uniqueIps)+'</div><div class=\"l\">unique IPs</div></div>'+
          '</div>'+
          (sessions.length?(
            '<table><thead><tr><th>When</th><th>Where</th><th>Network</th><th>Identity</th><th>Score</th></tr></thead><tbody>'+
              sessions.map((s)=> {
                const f=s.freeip||{};
                const where=[s.city,s.region,s.country].filter(Boolean).join(', ') || [f.city,f.region,f.country].filter(Boolean).join(', ');
                const net=[f.org,f.isp,f.asn].filter(Boolean).join(' • ');
                const id=(s.ptr||s.ip||'');
                return '<tr data-sid=\"'+s.sid+'\"><td>'+fmtDate(s.started_at)+'</td><td>'+(where||'<span class=\"mono\">(unknown)</span>')+'</td><td class=\"mono\">'+(net||'')+'</td><td class=\"mono\">'+id+'</td><td>'+(s.bot_score||0)+'</td></tr>';
              }).join('')+
            '</tbody></table>'
          ):'<div class=\"row\">No bot sessions.</div>');
        $('list').querySelectorAll('tr[data-sid]').forEach((tr)=>{
          tr.addEventListener('click', async ()=>{
            const sid=tr.getAttribute('data-sid');
            if(sid) await loadSession(sid);
          });
        });
        $('details').innerHTML=
          '<div class=\"split\">'+
            '<div><div class=\"row\" style=\"margin-bottom:8px\">Top reasons</div>'+ (reasons?('<table><thead><tr><th>Reason</th><th>Count</th></tr></thead><tbody>'+reasons+'</tbody></table>'):'<div class=\"row\">None</div>') +'</div>'+
            '<div><div class=\"row\" style=\"margin-bottom:8px\">Top user agents</div>'+ (uas?('<table><thead><tr><th>UA</th><th>Count</th></tr></thead><tbody>'+uas+'</tbody></table>'):'<div class=\"row\">None</div>') +'</div>'+
          '</div>'+
          '<div class=\"row\" style=\"margin-top:10px\">Tip: adjust sensitivity with <span class=\"mono\">BOT_SCORE_THRESHOLD</span> env var.</div>';
      }

	      function renderMap(){
	        const m=state.map;
	        if(!m){ $('list').innerHTML='<div class=\"row\">Loading…</div>'; $('details').innerHTML=''; return; }
	        const points=m.points||[];

	        const hint = points.length
	          ? '<div class=\"row\" style=\"margin-bottom:8px\">Map (scroll to zoom, drag to pan, click a marker)</div>'
	          : '<div class=\"row\" style=\"margin-bottom:8px\">Map</div><div class=\"row\">No geo points yet (needs Vercel geo headers).</div>';

	        const tableRows = points.slice(0, 120).map((p)=>{
	          const loc=[p.city,p.region,p.country].filter(Boolean).join(', ');
	          const flag = p.is_bot ? '<span class=\"tag bad\">bot</span>' : '<span class=\"tag good\">human?</span>';
	          return '<tr class=\"clickable\" data-vid=\"'+p.vid+'\">'+
	            '<td class=\"mono\">'+(p.display_name||p.vid.slice(0,8))+'</td>'+
	            '<td>'+loc+'</td>'+
	            '<td class=\"mono\">'+(p.ptr||p.ip||'')+'</td>'+
	            '<td>'+ (p.sessions||0) +'</td>'+
	            '<td>'+flag+'</td>'+
	          '</tr>';
	        }).join('');

	        $('list').innerHTML =
	          hint +
	          '<div id=\"map\"></div>' +
	          '<div class=\"row\" style=\"margin:12px 0 8px\">Visitors</div>' +
	          '<table><thead><tr><th>Visitor</th><th>Location</th><th>Identity</th><th>Sessions</th><th></th></tr></thead><tbody>' +
	            (tableRows || '<tr><td colspan=\"5\" style=\"text-align:center;color:var(--muted);\">No mappable visitors yet.</td></tr>') +
	          '</tbody></table>';

	        $('list').querySelectorAll('tr[data-vid]').forEach((tr)=>{
	          tr.addEventListener('click', async ()=>{
	            const vid=tr.getAttribute('data-vid');
	            if(vid) await loadVisitor(vid);
	          });
	        });

	        // If Leaflet is blocked/unavailable, fall back to the table-only view.
	        if (typeof window.L === 'undefined') {
	          $('details').innerHTML =
	            '<div class=\"row\">Interactive map blocked.</div>' +
	            '<div class=\"row\">Allow <span class=\"mono\">unpkg.com</span> and <span class=\"mono\">basemaps.cartocdn.com</span> (admin page only) to enable zoomable tiles.</div>';
	          return;
	        }

	        try {
	          if (window.__dossierLeafletMap) {
	            window.__dossierLeafletMap.remove();
	          }
	        } catch {}

	        const mapEl = document.getElementById('map');
	        if (!mapEl) return;

	        const leaflet = L.map('map', { center: [20, 0], zoom: 2, scrollWheelZoom: true, attributionControl: false });
	        window.__dossierLeafletMap = leaflet;

	        try {
	          L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { maxZoom: 18 }).addTo(leaflet);
	        } catch {
	          // Markers will still render on the dark background.
	        }

	        const markers = [];
	        points.forEach((p) => {
	          if (p.lat == null || p.lon == null) return;
	          const radius = Math.max(6, Math.min(14, 5 + Math.log2((p.sessions || 1) + 1) * 2));
	          const fill = p.is_bot ? 'rgba(251,113,133,0.9)' : 'rgba(255,215,0,0.85)';
	          const marker = L.circleMarker([p.lat, p.lon], {
	            radius,
	            color: 'rgba(0,0,0,0.35)',
	            weight: 1,
	            fillColor: fill,
	            fillOpacity: 0.9,
	          }).addTo(leaflet);
	          marker.bindTooltip((p.display_name||p.vid.slice(0,8)) + ' • ' + (p.sessions||0) + ' sessions', { direction: 'top' });
	          marker.on('click', () => loadVisitor(p.vid));
	          markers.push(marker);
	        });

	        if (markers.length >= 2) {
	          const group = L.featureGroup(markers);
	          leaflet.fitBounds(group.getBounds().pad(0.25), { maxZoom: 6 });
	        } else if (markers.length === 1) {
	          leaflet.setView(markers[0].getLatLng(), 6);
	        }

	        setTimeout(() => { try { leaflet.invalidateSize(); } catch {} }, 0);
	        $('details').innerHTML='<div class=\"row\">Click a marker (or a row) to open the visitor timeline.</div>';
	      }

      function renderSettings(){
        if(!state.settings){
          $('list').innerHTML='<div class=\"row\">Loading settings…</div>';
          $('details').innerHTML='<div class=\"row\">Settings are stored in Postgres (<span class=\"mono\">tracker_settings</span>).</div>';
          void (async ()=>{
            const st = await loadStatus(getToken());
            if(st && st.settings){ state.settings = st.settings; render(); }
          })();
          return;
        }

        const s=state.settings;
        const toMonths=(days)=> Math.max(1, Math.round(Number(days||30) / 30));
        $('list').innerHTML=
          '<div class=\"row\" style=\"margin-bottom:8px\">Settings</div>'+
          '<div class=\"row\" style=\"margin-bottom:8px\">Theme</div>'+
          '<div class=\"controls\" style=\"margin-bottom:12px\">'+
            '<label class=\"tag\"><input type=\"radio\" name=\"theme\" value=\"midnight\" '+(state.theme==='midnight'?'checked':'')+' /> midnight</label>'+
            '<label class=\"tag\"><input type=\"radio\" name=\"theme\" value=\"ember\" '+(state.theme==='ember'?'checked':'')+' /> ember</label>'+
            '<label class=\"tag\"><input type=\"radio\" name=\"theme\" value=\"sand\" '+(state.theme==='sand'?'checked':'')+' /> sand</label>'+
            '<label class=\"tag\"><input type=\"radio\" name=\"theme\" value=\"mint\" '+(state.theme==='mint'?'checked':'')+' /> mint</label>'+
          '</div>'+
          '<div class=\"pre\">'+
            'Retention\\n'+
            '  Humans: keep sessions for '+toMonths(s.retention_human_days)+' months\\n'+
            '  Bots: keep sessions for '+toMonths(s.retention_bot_days)+' months\\n\\n'+
          '</div>'+
          '<div class=\"row\" style=\"margin-top:12px\">Edit</div>'+
          '<div class=\"controls\" style=\"margin-top:10px\">'+
            '<label class=\"tag\">Humans (months) <input class=\"input\" style=\"min-width:120px\" id=\"retHuman\" type=\"number\" min=\"1\" max=\"60\" value=\"'+toMonths(s.retention_human_days)+'\" /></label>'+
            '<label class=\"tag\">Bots (months) <input class=\"input\" style=\"min-width:120px\" id=\"retBot\" type=\"number\" min=\"1\" max=\"12\" value=\"'+toMonths(s.retention_bot_days)+'\" /></label>'+
            '<button class=\"btn\" id=\"saveSettings\">Save</button>'+
          '</div>'+
          '<div class=\"row\" id=\"settingsMsg\" style=\"margin-top:10px\"></div>'+
          '<div class=\"row\" style=\"margin-top:14px\">Docs: <span class=\"mono\">README.md</span></div>';

        $('details').innerHTML=
          '<div class=\"row\" style=\"margin-bottom:8px\">Env vars</div>'+
          '<div class=\"pre\">'+
            'Required:\\n'+
            '  DATABASE_URL (or POSTGRES_URL*)\\n'+
            '  ADMIN_TOKEN\\n\\n'+
            'Optional:\\n'+
            '  IPINFO_TOKEN (humans only)\\n'+
            '  BOT_SCORE_THRESHOLD (default 6)\\n'+
          '</div>';

        const msgEl=$('settingsMsg');
        const saveBtn=$('saveSettings');
        if(saveBtn){
          saveBtn.addEventListener('click', async ()=>{
            const token=getToken();
            const patch={
              retention_human_days: Math.max(1, Number(($('retHuman') && $('retHuman').value) ? $('retHuman').value : toMonths(s.retention_human_days)) * 30),
              retention_bot_days: Math.max(1, Number(($('retBot') && $('retBot').value) ? $('retBot').value : toMonths(s.retention_bot_days)) * 30),
            };
            try{
              if(msgEl){ msgEl.textContent='Saving…'; msgEl.style.color='var(--muted)'; }
              const r=await fetch('/api/admin/status',{
                method:'POST',
                headers:{
                  'content-type':'application/json',
                  'accept':'application/json',
                  'authorization': token?('Bearer '+token):''
                },
                body: JSON.stringify(patch)
              });
              if(!r.ok) throw new Error(await r.text());
              const out=await r.json();
              state.settings=out.settings||patch;
              if(msgEl){ msgEl.textContent='Saved.'; msgEl.style.color='var(--green)'; }
              render();
            }catch(err){
              if(msgEl){ msgEl.textContent='Save failed.'; msgEl.style.color='var(--red)'; }
            }
          });
        }

        $('list').querySelectorAll('input[name=\"theme\"]').forEach((el)=>{
          el.addEventListener('change', (e)=>{
            const val = e.target?.value || 'midnight';
            state.theme = val;
            setTheme(val);
            localStorage.setItem('admin_theme', val);
          });
        });
      }

      function render(){
        if(state.view==='dashboard') return renderDashboard();
        if(state.view==='sessions') return renderSessions();
        if(state.view==='visitors') return renderVisitors();
        if(state.view==='bots') return renderBots();
        if(state.view==='map') return renderMap();
        if(state.view==='settings') return renderSettings();
      }

      async function loadOverview(){
        const data=await api('/api/admin/overview');
        state.overview=data;
        setLastUpdated(new Date());
        render();
      }
      async function loadSessions(){
        const bots=state.showBots?'1':'0';
        const data=await api('/api/admin/sessions?bots='+bots);
        state.sessions=data.sessions||[];
        state.sessionsPage = 1;
        setLastUpdated(new Date());
        render();
      }
      async function loadVisitors(){
        const bots=state.visitorsShowBots?'1':'0';
        const data=await api('/api/admin/visitors?bots='+bots);
        state.visitors=data.visitors||[];
        setLastUpdated(new Date());
        render();
      }
      async function loadBots(){
        const data=await api('/api/admin/bots?days=30');
        state.bots=data;
        setLastUpdated(new Date());
        render();
      }
      async function loadMap(){
        const bots=state.mapShowBots?'1':'0';
        const data=await api('/api/admin/map?bots='+bots);
        state.map=data;
        setLastUpdated(new Date());
        render();
      }

      async function loadVisitor(vid){
        state.selectedVid=vid;
        state.selectedSid=null;
        state.expandedSid=null;
        $('rawWrap').style.display='none';
        $('details').innerHTML='<div class=\"row\">Loading visitor…</div>';
        const data=await api('/api/admin/visitor?vid='+encodeURIComponent(vid));
        const v=data.visitor;
        const sessions=data.sessions||[];

        const loc=[v.city,v.region,v.country].filter(Boolean).join(', ');
        const ident=v.org || v.ptr || v.last_ip || '';
        const cluster=data.cluster || null;
        const related=data.related || [];
        const refs=data.refs || { tags: [], hosts: [] };
        const stats=data.stats || {};
        const cookies=(cluster && Array.isArray(cluster.session_cookies)) ? cluster.session_cookies : [];
        const ips=(cluster && Array.isArray(cluster.ips)) ? cluster.ips : [];
        const fpids=(cluster && Array.isArray(cluster.fingerprints)) ? cluster.fingerprints : [];
        const humanSessions=sessions.filter((s)=>!s.is_bot);
        const botSessions=sessions.filter((s)=>s.is_bot);
        const durations=humanSessions.map((s)=>Number(s.session_seconds ?? s.active_seconds)).filter((n)=>Number.isFinite(n) && n>0);
        const avgDur=Number.isFinite(stats.avg_session_seconds) ? stats.avg_session_seconds : (durations.length ? durations.reduce((a,b)=>a+b,0)/durations.length : null);
        const avgAct=Number.isFinite(stats.avg_actions) ? stats.avg_actions : null;
        const totalActions=Number.isFinite(stats.total_actions) ? stats.total_actions : null;
        const header=
          '<div class=\"row\" style=\"margin-bottom:10px\">'+
            '<span class=\"tag good\">visitor</span>'+
            '<span class=\"mono\">'+(v.display_name||v.vid.slice(0,8))+'</span>'+
          '</div>'+
          '<div class=\"row\" style=\"margin-bottom:10px\">'+
            (loc?('<span>Location: <span class=\"mono\">'+loc+'</span></span>'):'')+
            (ident?('<span>Identity: <span class=\"mono\">'+ident+'</span></span>'):'')+
          '</div>'+
          '<div class=\"row\" style=\"margin-bottom:10px\">'+
            '<span>First: <span class=\"mono\">'+fmtDate(v.first_seen_at)+'</span></span>'+
            '<span>Last: <span class=\"mono\">'+fmtDate(v.last_seen_at)+'</span></span>'+
          '</div>'+
          (cluster ? (
            '<div class=\"row\" style=\"margin-bottom:10px\">'+
              '<span>Entity ID: <span class=\"mono\">'+cluster.id+'</span></span>'+
              '<span class=\"mono\">'+cluster.display_name+'</span>'+
            '</div>'
          ) : '')+
          (cookies.length ? (
            '<div class=\"row\" style=\"margin-bottom:10px\">Session cookies: <span class=\"mono\">'+cookies.slice(0,6).join(', ')+'</span></div>'
          ) : '')+
          (fpids.length ? (
            '<div class=\"row\" style=\"margin-bottom:10px\">Fingerprints: <span class=\"mono\">'+fpids.slice(0,6).join(', ')+'</span></div>'
          ) : '')+
          (ips.length ? (
            '<div class=\"row\" style=\"margin-bottom:10px\">Known IPs: <span class=\"mono\">'+ips.slice(0,6).join(', ')+'</span></div>'
          ) : '')+
          ((refs.tags && refs.tags.length) ? (
            '<div class=\"row\" style=\"margin-bottom:10px\">Ref tags: <span class=\"mono\">'+refs.tags.slice(0,6).join(', ')+'</span></div>'
          ) : '')+
          ((refs.hosts && refs.hosts.length) ? (
            '<div class=\"row\" style=\"margin-bottom:10px\">Referrers: <span class=\"mono\">'+refs.hosts.slice(0,6).join(', ')+'</span></div>'
          ) : '')+
          '<div class=\"kpis\">'+
            '<div class=\"kpi\"><div class=\"n\">'+String(sessions.length)+'</div><div class=\"l\">sessions</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+String(stats.sessions_human ?? humanSessions.length)+'</div><div class=\"l\">human</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+String(stats.sessions_bot ?? botSessions.length)+'</div><div class=\"l\">bots</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+(avgDur==null?'—':fmtSec(avgDur))+'</div><div class=\"l\">avg time</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+(avgAct==null?'—':String(Math.round(avgAct)))+'</div><div class=\"l\">avg actions</div></div>'+
            '<div class=\"kpi\"><div class=\"n\">'+(totalActions==null?'—':String(Math.round(totalActions)))+'</div><div class=\"l\">total actions</div></div>'+
          '</div>'+
          '<div class=\"controls\" style=\"margin:10px 0\">'+
            '<input class=\"input\" id=\"dnInput\" value=\"'+(v.display_name||'').replace(/\"/g,'')+'\" placeholder=\"Display name\" />'+
            '<button class=\"btn\" id=\"dnSave\">Save name</button>'+
          '</div>';

        const rows=sessions.slice(0,80).map((s)=> {
          const where=[s.city,s.region,s.country].filter(Boolean).join(', ');
          const sum=[];
          if(s.session_seconds!=null) sum.push(fmtSec(s.session_seconds));
          if(s.interactions!=null) sum.push(s.interactions+' actions');
          if(s.overlays_unique!=null) sum.push(s.overlays_unique+' sections');
          const device=(s.is_mobile===true?'mobile':'desktop')+(s.orientation?' ('+s.orientation+')':'');
          const flag=s.is_bot?'<span class=\"tag bad\">bot</span>':'<span class=\"tag good\">human?</span>';
          return '<tr data-sid=\"'+s.sid+'\"><td>'+fmtDate(s.started_at)+'</td><td class=\"mono\">'+(s.page||'')+'</td><td>'+device+'</td><td>'+(where||'')+'</td><td>'+ (sum.join(' • ')||'') +'</td><td>'+flag+'</td></tr>';
        }).join('');

        const relatedRows = related.slice(0, 40).map((r)=>{
          const where=[r.city,r.region,r.country].filter(Boolean).join(', ');
          const who=r.org || r.ptr || (where?where:'');
          const why=[];
          if(r.shared_cookie) why.push('cookie');
          if(r.shared_ip) why.push('ip');
          if(r.shared_fingerprint) why.push('fingerprint');
          return '<tr data-vid=\"'+r.vid+'\">'+
            '<td class=\"mono\">'+(r.display_name||r.vid.slice(0,8))+'</td>'+
            '<td>'+fmtDate(r.last_seen_at)+'</td>'+
            '<td class=\"mono\">'+(who||'')+'</td>'+
            '<td class=\"mono\">'+(r.last_ip||'')+'</td>'+
            '<td>'+ (why.length?why.join(' + '):'') +'</td>'+
          '</tr>';
        }).join('');

        const actionRows = (data.top_actions || []).slice(0, 20).map((a)=>{
          const label = a.label || a.type || '';
          return '<tr><td class=\"mono\">'+label+'</td><td>'+a.count+'</td></tr>';
        }).join('');

        const actionsHtml = actionRows
          ? '<details style=\"margin-top:12px\"><summary class=\"row\">Top actions <span class=\"mono\" style=\"margin-left:auto\">▾</span></summary>'+
            '<table><thead><tr><th>Action</th><th>Count</th></tr></thead><tbody>'+actionRows+'</tbody></table></details>'
          : '';

        const relatedHtml = relatedRows
          ? '<div class=\"row\" style=\"margin:12px 0 8px\">Linked visitors</div>'+
            '<table><thead><tr><th>Visitor</th><th>Last seen</th><th>Identity</th><th>Last IP</th><th>Link</th></tr></thead><tbody>'+relatedRows+'</tbody></table>'
          : '';

        const clusterEditor = cluster
          ? '<div class=\"controls\" style=\"margin:10px 0\">'+
              '<input class=\"input\" id=\"clusterInput\" value=\"'+(cluster.display_name||'').replace(/\"/g,'')+'\" placeholder=\"Entity name\" />'+
              '<button class=\"btn\" id=\"clusterSave\">Save entity</button>'+
            '</div>'
          : '';

        $('details').innerHTML=header+clusterEditor+relatedHtml+
          '<div class=\"row\" style=\"margin:12px 0 8px\">Recent sessions</div>'+
          (rows?('<table><thead><tr><th>When</th><th>Page</th><th>Device</th><th>Where</th><th>Summary</th><th></th></tr></thead><tbody>'+rows+'</tbody></table>'):'<div class=\"row\">No sessions.</div>');
        if(actionsHtml){
          $('details').insertAdjacentHTML('beforeend', actionsHtml);
        }

        const saveBtn=$('dnSave');
        if(saveBtn){
          saveBtn.addEventListener('click', async ()=>{
            const token=getToken();
            const val=($('dnInput') && $('dnInput').value) ? $('dnInput').value : '';
            try{
              const r=await fetch('/api/admin/visitor',{
                method:'POST',
                headers:{
                  'content-type':'application/json',
                  'accept':'application/json',
                  'authorization': token?('Bearer '+token):''
                },
                body: JSON.stringify({ vid: v.vid, display_name: val })
              });
              if(!r.ok) throw new Error(await r.text());
              refreshVisitorUI();
            }catch{
              // ignore
            }
          });
        }
        const clusterSave=$('clusterSave');
        if(clusterSave && cluster){
          clusterSave.addEventListener('click', async ()=>{
            const token=getToken();
            const val=($('clusterInput') && $('clusterInput').value) ? $('clusterInput').value : '';
            try{
              const r=await fetch('/api/admin/visitor',{
                method:'POST',
                headers:{
                  'content-type':'application/json',
                  'accept':'application/json',
                  'authorization': token?('Bearer '+token):''
                },
                body: JSON.stringify({ cluster_id: cluster.id, cluster_name: val })
              });
              if(!r.ok) throw new Error(await r.text());
              refreshVisitorUI();
            }catch{
              // ignore
            }
          });
        }
        $('details').querySelectorAll('tr[data-vid]').forEach((tr)=>{
          tr.addEventListener('click', async ()=>{
            const linkVid=tr.getAttribute('data-vid');
            if(linkVid) await loadVisitor(linkVid);
          });
        });
        $('details').querySelectorAll('tr[data-sid]').forEach((tr)=>{
          tr.addEventListener('click', ()=>{
            const sid=tr.getAttribute('data-sid');
            if(!sid) return;
            setTimeout(()=>{ void loadSession(sid); }, 0);
          });
        });
      }

      function humanizeEvent(e){
        const type=e.type;
        const d=e.data || {};
        const get=(k)=> (d && typeof d==='object') ? d[k] : undefined;
        const t=fmtTime(e.ts);

        if(type==='visit'){
          const sw=get('screen_w'), sh=get('screen_h'), dpr=get('device_pixel_ratio');
          const detail=(sw && sh) ? ('screen '+sw+'×'+sh+(dpr?(' @'+dpr+'x'):'') ) : '';
          return {t,h:'Visit',d:detail};
        }
        if(type==='mobile_warning_shown') return {t,h:'Mobile banner shown',d:get('reason')?('reason: '+get('reason')):''};
        if(type==='rotate_prompt_shown') return {t,h:'Rotate prompt shown',d:get('reason')?('reason: '+get('reason')):''};
        if(type==='rotate_prompt_dismissed') return {t,h:'Rotate prompt dismissed',d:get('reason')?('reason: '+get('reason')):''};
        if(type==='click_target') return {t,h:'Click',d:get('target')?('target: '+get('target')):''};
        if(type==='hover_start') return {t,h:'Hover start',d:get('target')?('target: '+get('target')):''};
        if(type==='hover_end'){
          const sec=get('seconds');
          const bits=[];
          if(get('target')) bits.push('target: '+get('target'));
          if(sec!=null) bits.push(sec+'s');
          return {t,h:'Hover',d:bits.join(' • ')};
        }
        if(type==='open_overlay') return {t,h:'Open section',d:get('overlay')?('section: '+get('overlay')):''};
        if(type==='close_overlay'){
          const bits=[];
          if(get('overlay')) bits.push('section: '+get('overlay'));
          if(get('reason')) bits.push('reason: '+get('reason'));
          if(get('dwell_s')!=null) bits.push('dwell: '+get('dwell_s')+'s');
          if(get('max_scroll_pct')!=null) bits.push('scroll: '+Math.round(get('max_scroll_pct'))+'%');
          if(get('max_scroll_speed_px_s')!=null) bits.push('speed: '+Math.round(get('max_scroll_speed_px_s'))+'px/s');
          return {t,h:'Close section',d:bits.join(' • ')};
        }
        if(type==='focus' || type==='blur' || type==='visibility' || type==='idle_start' || type==='idle_end') return null;
        if(type==='perf_nav' || type==='fingerprint_ready') return null;
        if(type==='js_error' || type==='unhandledrejection') return null;
        return {t,h:type,d:e.data ? JSON.stringify(e.data) : ''};
      }

      async function fetchSession(sid, lite){
        const bucket = lite ? state.cache.sessionLite : state.cache.sessionFull;
        if(bucket[sid]) return bucket[sid];
        const data=await api('/api/admin/session?sid='+encodeURIComponent(sid)+(lite?'&lite=1':''));
        bucket[sid]=data;
        return data;
      }

      async function loadSessionLite(sid){
        try{
          await fetchSession(sid, true);
          render();
        }catch{
          // ignore
        }
      }

      async function loadSession(sid){
        state.selectedSid=sid;
        const rawWrap=$('rawWrap');
        if(rawWrap) rawWrap.style.display = (state.view==='sessions' || state.view==='bots') ? '' : 'none';
        const data=await fetchSession(sid, false);
        const s=data.session;
        const events=data.events||[];

        const headerBits=[];
        headerBits.push('<div class=\"row\" style=\"margin-bottom:10px\">'+
          '<span class=\"tag '+(s.is_bot?'bad':'good')+'\">'+(s.is_bot?'bot':'human?')+'</span>'+
          (s.display_name?('<span class=\"mono\">'+s.display_name+'</span>'):'')+
          '<span class=\"mono\">'+s.sid+'</span>'+
        '</div>');
        headerBits.push('<div class=\"row\" style=\"margin-bottom:10px\">'+
          '<span>Started: <span class=\"mono\">'+fmtDate(s.started_at)+'</span></span>'+
          (s.ended_at?('<span>Ended: <span class=\"mono\">'+fmtDate(s.ended_at)+'</span></span>'):'')+
        '</div>');
        headerBits.push('<div class=\"row\" style=\"margin-bottom:10px\">'+
          (s.location?('<span>Location: <span class=\"mono\">'+s.location+'</span></span>'):'')+
          (s.org?('<span>Org: <span class=\"mono\">'+s.org+'</span></span>'):'')+
        '</div>');
        headerBits.push('<div class=\"row\" style=\"margin-bottom:10px\">'+
          (s.ptr?('<span>PTR: <span class=\"mono\">'+s.ptr+'</span></span>'):'')+
          (s.ip?('<span>IP: <span class=\"mono\">'+s.ip+'</span></span>'):'')+
        '</div>');
        const identLines=[];
        if(s.session_cookie_id) identLines.push('<div>Session cookie: <span class=\"mono\">'+s.session_cookie_id+'</span></div>');
        if(s.fingerprint_id) identLines.push('<div>Fingerprint: <span class=\"mono\">'+s.fingerprint_id+'</span></div>');
        if(s.ref_tag) identLines.push('<div>Ref: <span class=\"mono\">'+s.ref_tag+'</span></div>');
        if(identLines.length){
          headerBits.push('<div class=\"pre\">'+identLines.join('\\n')+'</div>');
        }

        const kpis=[];
        const activeSeconds = s.active_seconds ?? (Number.isFinite(s.session_seconds) ? s.session_seconds : null);
        const totalSeconds = s.session_seconds ?? (Number.isFinite(s.active_seconds) ? s.active_seconds : null);
        const actions = Number.isFinite(s.interactions) ? s.interactions : null;
        kpis.push('<div class=\"kpi\"><div class=\"n\">'+fmtSec(activeSeconds)+'</div><div class=\"l\">active time</div></div>');
        if (s.idle_seconds != null) kpis.push('<div class=\"kpi\"><div class=\"n\">'+fmtSec(s.idle_seconds)+'</div><div class=\"l\">idle time</div></div>');
        kpis.push('<div class=\"kpi\"><div class=\"n\">'+fmtSec(totalSeconds)+'</div><div class=\"l\">total time</div></div>');
        kpis.push('<div class=\"kpi\"><div class=\"n\">'+(actions==null?'—':String(actions))+'</div><div class=\"l\">actions</div></div>');
        kpis.push('<div class=\"kpi\"><div class=\"n\">'+(s.overlays_unique ?? (Array.isArray(s.overlays)?s.overlays.length: '—'))+'</div><div class=\"l\">sections visited</div></div>');
        kpis.push('<div class=\"kpi\"><div class=\"n\">'+(s.is_mobile?'mobile':'desktop')+'</div><div class=\"l\">device</div></div>');

	        const header=headerBits.join('')+'<div class=\"kpis\">'+kpis.join('')+'</div>';

	        // Breakdowns
	        const clickCounts = new Map();
	        const hoverSeconds = new Map();
	        const sectionDwell = new Map();
	        const sectionScroll = new Map(); // overlay -> max scroll pct

	        for (const e of events) {
	          const d = e && e.data ? e.data : null;
	          if (!d || typeof d !== 'object') continue;

	          if (e.type === 'click_target') {
	            const t = d.target;
	            if (typeof t === 'string' && t) clickCounts.set(t, (clickCounts.get(t) || 0) + 1);
	          }
	          if (e.type === 'hover_end') {
	            const t = d.target;
	            const sec = d.seconds;
	            if (typeof t === 'string' && t && typeof sec === 'number' && Number.isFinite(sec)) {
	              hoverSeconds.set(t, (hoverSeconds.get(t) || 0) + sec);
	            }
	          }
	          if (e.type === 'close_overlay') {
	            const o = d.overlay;
	            const dwell = d.dwell_s;
	            const sc = d.max_scroll_pct;
	            if (typeof o === 'string' && o) {
	              if (typeof dwell === 'number' && Number.isFinite(dwell)) sectionDwell.set(o, (sectionDwell.get(o) || 0) + dwell);
	              if (typeof sc === 'number' && Number.isFinite(sc)) sectionScroll.set(o, Math.max(sectionScroll.get(o) || 0, sc));
	            }
	          }
	        }

	        function topEntries(map, n) {
	          return Array.from(map.entries()).sort((a,b)=>b[1]-a[1]).slice(0,n);
	        }

	        const topClicks = topEntries(clickCounts, 8);
	        const topHover = topEntries(hoverSeconds, 8);
	        const topSections = topEntries(sectionDwell, 8);

	        const breakdownHtml = [
	          '<div style=\"margin-top:12px\" class=\"split\">',
	            '<div>',
	              '<div class=\"row\" style=\"margin-bottom:8px\">Sections</div>',
	              (topSections.length ? (
	                '<table><thead><tr><th>Section</th><th>Time</th><th>Max scroll</th></tr></thead><tbody>' +
	                  topSections.map(([k,v]) => '<tr><td class=\"mono\">'+k+'</td><td>'+fmtSec(v)+'</td><td>'+(sectionScroll.has(k)?(sectionScroll.get(k)+'%'):'—')+'</td></tr>').join('') +
	                '</tbody></table>'
	              ) : '<div class=\"row\">No section data yet.</div>'),
	            '</div>',
	            '<div>',
	              '<div class=\"row\" style=\"margin-bottom:8px\">Objects</div>',
	              ((topClicks.length || topHover.length) ? (
	                '<table><thead><tr><th>Target</th><th>Clicks</th><th>Hover</th></tr></thead><tbody>' +
	                  Array.from(new Set([...topClicks.map(x=>x[0]), ...topHover.map(x=>x[0])])).slice(0,10).map((k) => {
	                    const c = clickCounts.get(k) || 0;
	                    const h = hoverSeconds.get(k) || 0;
	                    return '<tr><td class=\"mono\">'+k+'</td><td>'+(c||'—')+'</td><td>'+(h?fmtSec(h):'—')+'</td></tr>';
	                  }).join('') +
	                '</tbody></table>'
	              ) : '<div class=\"row\">No object interactions yet.</div>'),
	            '</div>',
	          '</div>'
	        ].join('');

        const ipHistory=(data.ip_history||[]).map((h)=>{
          return '<tr><td class=\"mono\">'+(h.ip||'')+'</td><td>'+fmtDate(h.first_seen_at)+'</td><td>'+fmtDate(h.last_seen_at)+'</td><td>'+String(h.hit_count||0)+'</td></tr>';
        }).join('');

        const timeline=events.slice(0,800).map((e)=>{
          const x=humanizeEvent(e);
          if(!x) return '';
          return '<div class=\"evt\"><div class=\"t\">'+(x.t||'')+'</div><div><div class=\"h\">'+x.h+'</div><div class=\"d\">'+(x.d||'')+'</div></div></div>';
        }).filter(Boolean).join('');
        const raw=events.slice(0,1200).map((e)=>{
          const t=fmtDate(e.ts);
          const data=e.data?JSON.stringify(e.data):'';
          return t+'  '+e.type+(data?('  '+data):'');
        }).join('\\n');

	        const ipHtml = ipHistory
	          ? '<div style=\"margin-top:12px\"><div class=\"row\" style=\"margin-bottom:8px\">IP changes</div><table><thead><tr><th>IP</th><th>First seen</th><th>Last seen</th><th>Hits</th></tr></thead><tbody>'+ipHistory+'</tbody></table></div>'
	          : '';
	        $('details').innerHTML=header+breakdownHtml+ipHtml+'<div style=\"margin-top:12px\">'+(state.raw?('<div class=\"pre\">'+(raw||'(none)')+'</div>'):('<div class=\"timeline\">'+(timeline||'<div class=\"row\">No events yet.</div>')+'</div>'))+'</div>';
	      }

	      function setView(view){
	        state.view=view;
	        state.search='';
	        const search=$('search');
	        if(search) {
	          search.value='';
	          search.style.display = (view==='sessions' || view==='visitors' || view==='bots') ? '' : 'none';
	        }
	        const btns=[
	          ['dashboard','btnDashboard'],
	          ['sessions','btnSessions'],
	          ['visitors','btnVisitors'],
	          ['bots','btnBots'],
	          ['map','btnMap'],
	          ['settings','btnSettings'],
	        ];
	        for(const [v,id] of btns){
	          const el=$(id);
	          if(!el) continue;
	          if(v===view) el.classList.add('active'); else el.classList.remove('active');
	        }
        const showBotsWrap=$('showBotsWrap');
        if(showBotsWrap) showBotsWrap.style.display = view==='sessions' ? '' : 'none';
        const visitorBotsWrap=$('visitorBotsWrap');
        if(visitorBotsWrap) visitorBotsWrap.style.display = view==='visitors' ? '' : 'none';
        const mapBotsWrap=$('mapBotsWrap');
        if(mapBotsWrap) mapBotsWrap.style.display = view==='map' ? '' : 'none';
	        const rawWrap=$('rawWrap');
	        if(rawWrap) rawWrap.style.display = (state.selectedSid && (view==='sessions' || view==='bots')) ? '' : 'none';

	        render();
	      }

	      $('btnDashboard').addEventListener('click', ()=>{
	        setView('dashboard');
	        void loadOverview();
	      });
	      $('btnSessions').addEventListener('click', ()=>{
	        setView('sessions');
	        void loadSessions();
	      });
	      $('btnVisitors').addEventListener('click', ()=>{
	        setView('visitors');
	        void loadVisitors();
	      });
	      $('btnBots').addEventListener('click', ()=>{
	        setView('bots');
	        void loadBots();
	      });
	      $('btnMap').addEventListener('click', ()=>{
	        setView('map');
	        void loadMap();
	      });
	      $('btnSettings').addEventListener('click', ()=>{
	        setView('settings');
	      });

	      $('logout').addEventListener('click', ()=>{
	        forgetToken();
	        location.reload();
	      });

      $('showBots').addEventListener('change', async (e)=>{
        state.showBots=e.target.checked;
        if(state.view==='sessions') await loadSessions();
      });
      $('showBotsVisitors').addEventListener('change', async (e)=>{
        state.visitorsShowBots=e.target.checked;
        if(state.view==='visitors') await loadVisitors();
      });
	      $('mapBots').addEventListener('change', async (e)=>{
	        state.mapShowBots=e.target.checked;
	        if(state.view==='map') await loadMap();
	      });
        let searchTimer=null;
	      $('search').addEventListener('input',(e)=>{
          state.search=e.target.value||'';
          if(searchTimer) clearTimeout(searchTimer);
          searchTimer=setTimeout(()=>render(), 120);
        });
        async function refreshCurrent(){
          if(state.view==='map') return;
          if(state.view==='dashboard') await loadOverview();
          else if(state.view==='sessions') await loadSessions();
          else if(state.view==='visitors') await loadVisitors();
          else if(state.view==='bots') await loadBots();
          else render();
        }
	      $('refresh').addEventListener('click', async ()=>{ await refreshCurrent(); });
	      $('rawToggle').addEventListener('change', async (e)=>{ state.raw=e.target.checked; if(state.selectedSid) await loadSession(state.selectedSid); });

        // Auto-refresh keeps the dashboard usable without a manual reload button.
        let refreshTimer=null;
        function startAutoRefresh(){
          if(refreshTimer) clearInterval(refreshTimer);
          refreshTimer=setInterval(()=>{
            if(document.hidden) return;
            if(state.view==='map') return;
            const active=document.activeElement;
            if(active && (active.tagName==='INPUT' || active.tagName==='TEXTAREA' || active.isContentEditable)) return;
            void refreshCurrent();
          }, 25000);
        }

	      async function doContinue(){
	        const t=$('token').value||'';
	        if(!t){ showAuth('Enter a token to continue.', true); return; }
	        showAuth('Checking token…', false);
	        const ok=await checkAuth(t);
	        if(!ok){ showAuth('Invalid token.', true); return; }
	        setToken(t);
	        $('token').value='';
	        showApp();
          startAutoRefresh();
          const st = await loadStatus(getToken());
          if(st && st.settings){
            state.settings = st.settings;
            state.mapShowBots = Boolean(st.settings.map_include_bots_default);
            const mb = $('mapBots');
            if(mb) mb.checked = state.mapShowBots;
          }
	        setView('visitors');
	        await loadVisitors();
	      }
      $('continue').addEventListener('click', ()=>{ void doContinue(); });
      $('token').addEventListener('keydown', (e)=>{ if(e.key==='Enter') void doContinue(); });
      $('forget').addEventListener('click', ()=>{ forgetToken(); showAuth('Token forgotten.', false); });

      (async ()=>{
        const status=await loadStatus();
        if(status && status.admin_token_configured===false){ showAuth('ADMIN_TOKEN is not configured in Vercel env vars.', true); return; }
        if(status && status.db_configured===false){ showAuth('DATABASE_URL/POSTGRES_URL is not configured in Vercel env vars.', true); return; }

        const savedTheme = localStorage.getItem('admin_theme');
        if(savedTheme){ state.theme = savedTheme; setTheme(savedTheme); }

        const saved=getToken();
        if(!saved){ showAuth('', false); return; }
        showAuth('Checking saved token…', false);
	        const ok=await checkAuth(saved);
	        if(!ok){ forgetToken(); showAuth('Saved token was invalid. Please re-enter.', true); return; }
	        showApp();
          if(savedTheme){ setTheme(savedTheme); }
          startAutoRefresh();
          const st = await loadStatus(saved);
          if(st && st.settings){
            state.settings = st.settings;
            state.mapShowBots = Boolean(st.settings.map_include_bots_default);
            const mb = $('mapBots');
            if(mb) mb.checked = state.mapShowBots;
          }
	        setView('visitors');
	        await loadVisitors();
	      })();
    </script>
  </body>
</html>`);
}
